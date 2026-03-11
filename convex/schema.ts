import { defineSchema, defineTable } from "convex/server"
import { authTables } from "@convex-dev/auth/server"
import { v } from "convex/values"

export default defineSchema({
	...authTables,

	hevyUsers: defineTable({
		userId: v.id("users"),
		hevyId: v.string(),
		hevyUsername: v.string(),
		apiKey: v.string(),
		webhookSecret: v.optional(v.string()),
	})
		.index("by_userId", ["userId"])
		.index("by_hevyUsername", ["hevyUsername"])
		.index("by_hevyId", ["hevyId"]),

	spotifyTokens: defineTable({
		userId: v.id("users"),
		accessToken: v.string(),
		refreshToken: v.string(),
		expiresAt: v.number(),
		spotifyUserId: v.string(),
	}).index("by_userId", ["userId"]),

	workouts: defineTable({
		userId: v.id("users"),
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
	})
		.index("by_userId", ["userId"])
		.index("by_userId_hevyWorkoutId", ["userId", "hevyWorkoutId"]),

	musicHistory: defineTable({
		userId: v.id("users"),
		spotifyTrackId: v.string(),
		trackName: v.string(),
		artistName: v.string(),
		albumName: v.string(),
		albumImageUrl: v.optional(v.string()),
		playedAt: v.string(),
		durationMs: v.optional(v.number()),
		trackUrl: v.optional(v.string()),
	})
		.index("by_userId", ["userId"])
		.index("by_userId_playedAt", ["userId", "playedAt"]),
})
