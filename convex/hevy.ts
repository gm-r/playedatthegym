import { v } from "convex/values"
import { action, internalMutation, internalQuery } from "./_generated/server"
import { internal } from "./_generated/api"
import { getAuthUserId } from "@convex-dev/auth/server"

// --- Types for the Hevy API response ---

type HevySet = {
	index: number
	type: string
	weight_kg: number | null
	reps: number | null
	distance_meters: number | null
	duration_seconds: number | null
	rpe: number | null
	custom_metric: number | null
}

type HevyExercise = {
	index: number
	title: string
	notes: string | null
	exercise_template_id: string
	supersets_id: number | null
	sets: HevySet[]
}

type HevyWorkout = {
	id: string
	title: string
	routine_id: string | null
	description: string | null
	start_time: string
	end_time: string
	updated_at: string
	created_at: string
	exercises: HevyExercise[]
}

type HevyWorkoutsResponse = {
	page: number
	page_count: number
	workouts: HevyWorkout[]
}

// --- Pure helper functions (exported for testing) ---

export function mapWorkout(w: HevyWorkout) {
	return {
		hevyWorkoutId: w.id,
		title: w.title,
		routineId: w.routine_id ?? undefined,
		description: w.description ?? undefined,
		startTime: w.start_time,
		endTime: w.end_time,
		updatedAt: w.updated_at,
		createdAt: w.created_at,
		exercises: w.exercises.map((e) => ({
			index: e.index,
			title: e.title,
			notes: e.notes ?? undefined,
			exerciseTemplateId: e.exercise_template_id,
			supersetsId: e.supersets_id ?? undefined,
			sets: e.sets.map((s) => ({
				index: s.index,
				type: s.type,
				weightKg: s.weight_kg ?? undefined,
				reps: s.reps ?? undefined,
				distanceMeters: s.distance_meters ?? undefined,
				durationSeconds: s.duration_seconds ?? undefined,
				rpe: s.rpe ?? undefined,
				customMetric: s.custom_metric ?? undefined,
			})),
		})),
	}
}

export function filterNewWorkouts<T extends { hevyWorkoutId: string }>(
	workouts: T[],
	existingIds: Set<string>,
): T[] {
	return workouts.filter((w) => !existingIds.has(w.hevyWorkoutId))
}

// --- Convex functions ---

export const getExistingWorkoutIds = internalQuery({
	args: { userId: v.id("users") },
	returns: v.array(v.string()),
	handler: async (ctx, args) => {
		const workouts = await ctx.db
			.query("workouts")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.collect()
		return workouts.map((w) => w.hevyWorkoutId)
	},
})

export const getMostRecentWorkoutStartTime = internalQuery({
	args: { userId: v.id("users") },
	returns: v.union(v.string(), v.null()),
	handler: async (ctx, args) => {
		const workouts = await ctx.db
			.query("workouts")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.collect()
		if (workouts.length === 0) return null
		workouts.sort(
			(a, b) =>
				new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
		)
		return workouts[0].startTime
	},
})

export const storeWorkouts = internalMutation({
	args: {
		userId: v.id("users"),
		workouts: v.array(
			v.object({
				hevyWorkoutId: v.string(),
				title: v.string(),
				routineId: v.optional(v.string()),
				description: v.optional(v.string()),
				startTime: v.string(),
				endTime: v.string(),
				updatedAt: v.string(),
				createdAt: v.string(),
				exercises: v.array(
					v.object({
						index: v.number(),
						title: v.string(),
						notes: v.optional(v.string()),
						exerciseTemplateId: v.string(),
						supersetsId: v.optional(v.number()),
						sets: v.array(
							v.object({
								index: v.number(),
								type: v.string(),
								weightKg: v.optional(v.number()),
								reps: v.optional(v.number()),
								distanceMeters: v.optional(v.number()),
								durationSeconds: v.optional(v.number()),
								rpe: v.optional(v.number()),
								customMetric: v.optional(v.number()),
							}),
						),
					}),
				),
			}),
		),
	},
	handler: async (ctx, args) => {
		for (const workout of args.workouts) {
			await ctx.db.insert("workouts", {
				userId: args.userId,
				...workout,
			})
		}
	},
})

export const fetchWorkouts = action({
	args: {},
	returns: v.object({ added: v.number(), total: v.number() }),
	handler: async (ctx): Promise<{ added: number; total: number }> => {
		const userId = await getAuthUserId(ctx)
		if (!userId) throw new Error("Not authenticated")

		const apiKey = process.env.HEVY_API_KEY
		if (!apiKey) throw new Error("HEVY_API_KEY environment variable not set")

		// Fetch all workouts from Hevy API with pagination
		let page = 1
		let pageCount = 1
		const allApiWorkouts: HevyWorkout[] = []

		while (page <= pageCount) {
			const res = await fetch(
				`https://api.hevyapp.com/v1/workouts?page=${page}&pageSize=10`,
				{ headers: { "api-key": apiKey } },
			)
			if (!res.ok) {
				throw new Error(`Hevy API error: ${res.status} ${res.statusText}`)
			}
			const data: HevyWorkoutsResponse = await res.json()
			pageCount = data.page_count
			allApiWorkouts.push(...data.workouts)
			page++
		}

		// Map to our schema format
		const mappedWorkouts = allApiWorkouts.map(mapWorkout)

		// Get existing workout IDs for dedup
		const existingIds = await ctx.runQuery(
			internal.hevy.getExistingWorkoutIds,
			{ userId },
		)
		const existingIdSet = new Set(existingIds)

		// Filter out duplicates
		const newWorkouts = filterNewWorkouts(mappedWorkouts, existingIdSet)

		// Store in batches of 50 to avoid argument size limits
		const BATCH_SIZE = 50
		for (let i = 0; i < newWorkouts.length; i += BATCH_SIZE) {
			const batch = newWorkouts.slice(i, i + BATCH_SIZE)
			await ctx.runMutation(internal.hevy.storeWorkouts, {
				userId,
				workouts: batch,
			})
		}

		return { added: newWorkouts.length, total: allApiWorkouts.length }
	},
})
