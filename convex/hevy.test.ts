import { describe, expect, it } from "vitest"
import { mapWorkout, filterNewWorkouts } from "./hevy"

const makeHevyWorkout = (overrides = {}) => ({
	id: "workout-1",
	title: "Morning Workout",
	routine_id: "routine-1",
	description: "Great session",
	start_time: "2024-01-15T08:00:00Z",
	end_time: "2024-01-15T09:00:00Z",
	updated_at: "2024-01-15T09:00:00Z",
	created_at: "2024-01-15T08:00:00Z",
	exercises: [
		{
			index: 0,
			title: "Bench Press (Barbell)",
			notes: "Felt strong",
			exercise_template_id: "05293BCA",
			supersets_id: 1,
			sets: [
				{
					index: 0,
					type: "normal",
					weight_kg: 100,
					reps: 10,
					distance_meters: null,
					duration_seconds: null,
					rpe: 8.5,
					custom_metric: null,
				},
			],
		},
	],
	...overrides,
})

describe("mapWorkout", () => {
	it("maps snake_case API response to camelCase schema", () => {
		const result = mapWorkout(makeHevyWorkout())

		expect(result.hevyWorkoutId).toBe("workout-1")
		expect(result.title).toBe("Morning Workout")
		expect(result.routineId).toBe("routine-1")
		expect(result.description).toBe("Great session")
		expect(result.startTime).toBe("2024-01-15T08:00:00Z")
		expect(result.endTime).toBe("2024-01-15T09:00:00Z")
		expect(result.updatedAt).toBe("2024-01-15T09:00:00Z")
		expect(result.createdAt).toBe("2024-01-15T08:00:00Z")

		expect(result.exercises).toHaveLength(1)
		const exercise = result.exercises[0]
		expect(exercise.index).toBe(0)
		expect(exercise.title).toBe("Bench Press (Barbell)")
		expect(exercise.notes).toBe("Felt strong")
		expect(exercise.exerciseTemplateId).toBe("05293BCA")
		expect(exercise.supersetsId).toBe(1)

		expect(exercise.sets).toHaveLength(1)
		const set = exercise.sets[0]
		expect(set.index).toBe(0)
		expect(set.type).toBe("normal")
		expect(set.weightKg).toBe(100)
		expect(set.reps).toBe(10)
		expect(set.rpe).toBe(8.5)
	})

	it("converts null optional fields to undefined", () => {
		const workout = makeHevyWorkout({
			routine_id: null,
			description: null,
			exercises: [
				{
					index: 0,
					title: "Running",
					notes: null,
					exercise_template_id: "ABC123",
					supersets_id: null,
					sets: [
						{
							index: 0,
							type: "normal",
							weight_kg: null,
							reps: null,
							distance_meters: 5000,
							duration_seconds: 1800,
							rpe: null,
							custom_metric: null,
						},
					],
				},
			],
		})

		const result = mapWorkout(workout)

		expect(result.routineId).toBeUndefined()
		expect(result.description).toBeUndefined()
		expect(result.exercises[0].notes).toBeUndefined()
		expect(result.exercises[0].supersetsId).toBeUndefined()

		const set = result.exercises[0].sets[0]
		expect(set.weightKg).toBeUndefined()
		expect(set.reps).toBeUndefined()
		expect(set.rpe).toBeUndefined()
		expect(set.customMetric).toBeUndefined()
		expect(set.distanceMeters).toBe(5000)
		expect(set.durationSeconds).toBe(1800)
	})

	it("handles workout with multiple exercises and sets", () => {
		const workout = makeHevyWorkout({
			exercises: [
				{
					index: 0,
					title: "Squat",
					notes: null,
					exercise_template_id: "SQ001",
					supersets_id: null,
					sets: [
						{
							index: 0,
							type: "warmup",
							weight_kg: 60,
							reps: 10,
							distance_meters: null,
							duration_seconds: null,
							rpe: null,
							custom_metric: null,
						},
						{
							index: 1,
							type: "normal",
							weight_kg: 100,
							reps: 5,
							distance_meters: null,
							duration_seconds: null,
							rpe: 9,
							custom_metric: null,
						},
					],
				},
				{
					index: 1,
					title: "Leg Press",
					notes: "Go deep",
					exercise_template_id: "LP001",
					supersets_id: null,
					sets: [
						{
							index: 0,
							type: "normal",
							weight_kg: 200,
							reps: 12,
							distance_meters: null,
							duration_seconds: null,
							rpe: 7,
							custom_metric: null,
						},
					],
				},
			],
		})

		const result = mapWorkout(workout)
		expect(result.exercises).toHaveLength(2)
		expect(result.exercises[0].sets).toHaveLength(2)
		expect(result.exercises[1].sets).toHaveLength(1)
		expect(result.exercises[0].sets[0].type).toBe("warmup")
		expect(result.exercises[1].title).toBe("Leg Press")
	})
})

describe("filterNewWorkouts", () => {
	const workouts = [
		{ hevyWorkoutId: "a", title: "Workout A" },
		{ hevyWorkoutId: "b", title: "Workout B" },
		{ hevyWorkoutId: "c", title: "Workout C" },
	]

	it("filters out workouts that already exist", () => {
		const existing = new Set(["b"])
		const result = filterNewWorkouts(workouts, existing)

		expect(result).toHaveLength(2)
		expect(result.map((w) => w.hevyWorkoutId)).toEqual(["a", "c"])
	})

	it("returns all workouts when none exist yet", () => {
		const existing = new Set<string>()
		const result = filterNewWorkouts(workouts, existing)

		expect(result).toHaveLength(3)
	})

	it("returns empty array when all workouts already exist", () => {
		const existing = new Set(["a", "b", "c"])
		const result = filterNewWorkouts(workouts, existing)

		expect(result).toHaveLength(0)
	})

	it("handles empty input workouts", () => {
		const existing = new Set(["a"])
		const result = filterNewWorkouts([], existing)

		expect(result).toHaveLength(0)
	})
})
