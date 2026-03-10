import { describe, expect, it } from "vitest"
import {
	estimateSetTimings,
	computeTrackWindows,
	matchSongsToSets,
	buildWorkoutCards,
	type Exercise,
	type MusicTrack,
} from "./matching"

const makeExercise = (overrides: Partial<Exercise> = {}): Exercise => ({
	index: 0,
	title: "Bench Press (Barbell)",
	notes: undefined,
	exerciseTemplateId: "BP001",
	supersetsId: undefined,
	sets: [
		{ index: 0, type: "normal", weightKg: 100, reps: 8 },
	],
	...overrides,
})

const makeMusicTrack = (overrides: Partial<MusicTrack> = {}): MusicTrack => ({
	spotifyTrackId: "track-1",
	trackName: "Test Song",
	artistName: "Test Artist",
	albumName: "Test Album",
	albumImageUrl: "https://example.com/img.jpg",
	playedAt: "2024-01-15T08:30:00Z",
	durationMs: 240_000, // 4 minutes
	trackUrl: "https://open.spotify.com/track/1",
	...overrides,
})

const WORKOUT_START = new Date("2024-01-15T08:00:00Z").getTime()
const WORKOUT_END = new Date("2024-01-15T09:00:00Z").getTime() // 60 min

const makeWorkoutInput = (overrides = {}) => ({
	_id: "workout-id-1",
	hevyWorkoutId: "hevy-1",
	title: "Morning Push Day",
	startTime: "2024-01-15T08:00:00Z",
	endTime: "2024-01-15T09:00:00Z",
	exercises: [makeExercise()],
	...overrides,
})

describe("estimateSetTimings", () => {
	it("single normal set fills entire workout window", () => {
		const exercises = [makeExercise()]
		const result = estimateSetTimings(exercises, WORKOUT_START, WORKOUT_END)

		expect(result).toHaveLength(1)
		expect(result[0].estimatedStartMs).toBe(WORKOUT_START)
		expect(result[0].estimatedEndMs).toBe(WORKOUT_END)
		expect(result[0].exerciseTitle).toBe("Bench Press (Barbell)")
		expect(result[0].setIndex).toBe(0)
		expect(result[0].setType).toBe("normal")
	})

	it("warmup set gets half the time of a normal set", () => {
		const exercises = [
			makeExercise({
				sets: [
					{ index: 0, type: "warmup", weightKg: 60, reps: 10 },
					{ index: 1, type: "normal", weightKg: 100, reps: 8 },
				],
			}),
		]

		const result = estimateSetTimings(exercises, WORKOUT_START, WORKOUT_END)

		expect(result).toHaveLength(2)
		// warmup=0.5, normal=1.0, total=1.5
		// warmup duration = 60min * (0.5/1.5) = 20 min
		// normal duration = 60min * (1.0/1.5) = 40 min
		const warmupDurationMs = result[0].estimatedEndMs - result[0].estimatedStartMs
		const normalDurationMs = result[1].estimatedEndMs - result[1].estimatedStartMs

		expect(warmupDurationMs).toBeCloseTo(20 * 60_000, -1)
		expect(normalDurationMs).toBeCloseTo(40 * 60_000, -1)
		expect(result[0].estimatedStartMs).toBe(WORKOUT_START)
		expect(result[1].estimatedEndMs).toBeCloseTo(WORKOUT_END, -1)
		// Sets are sequential — warmup ends where normal starts
		expect(result[0].estimatedEndMs).toBeCloseTo(result[1].estimatedStartMs, -1)
	})

	it("multiple exercises produce correct sequential non-overlapping windows", () => {
		const exercises = [
			makeExercise({
				index: 0,
				title: "Bench Press",
				sets: [
					{ index: 0, type: "normal", weightKg: 100, reps: 8 },
					{ index: 1, type: "normal", weightKg: 100, reps: 8 },
				],
			}),
			makeExercise({
				index: 1,
				title: "Overhead Press",
				sets: [
					{ index: 0, type: "normal", weightKg: 60, reps: 10 },
				],
			}),
		]

		const result = estimateSetTimings(exercises, WORKOUT_START, WORKOUT_END)

		expect(result).toHaveLength(3)
		// All normal sets — each gets 1/3 of 60 min = 20 min
		for (let i = 0; i < 3; i++) {
			const duration = result[i].estimatedEndMs - result[i].estimatedStartMs
			expect(duration).toBeCloseTo(20 * 60_000, -1)
		}
		// Sequential: each set starts where the previous ended
		expect(result[1].estimatedStartMs).toBeCloseTo(result[0].estimatedEndMs, -1)
		expect(result[2].estimatedStartMs).toBeCloseTo(result[1].estimatedEndMs, -1)
		// Exercise grouping preserved
		expect(result[0].exerciseTitle).toBe("Bench Press")
		expect(result[2].exerciseTitle).toBe("Overhead Press")
	})

	it("empty exercises returns empty array", () => {
		const result = estimateSetTimings([], WORKOUT_START, WORKOUT_END)
		expect(result).toHaveLength(0)
	})

	it("preserves set details (weight, reps, rpe)", () => {
		const exercises = [
			makeExercise({
				sets: [
					{ index: 0, type: "normal", weightKg: 120, reps: 5, rpe: 9 },
				],
			}),
		]

		const result = estimateSetTimings(exercises, WORKOUT_START, WORKOUT_END)
		expect(result[0].weightKg).toBe(120)
		expect(result[0].reps).toBe(5)
		expect(result[0].rpe).toBe(9)
	})
})

describe("computeTrackWindows", () => {
	it("computes correct window with durationMs", () => {
		const track = makeMusicTrack({
			playedAt: "2024-01-15T08:30:00Z",
			durationMs: 240_000, // 4 minutes
		})

		const result = computeTrackWindows([track])

		expect(result).toHaveLength(1)
		expect(result[0].windowEndMs).toBe(new Date("2024-01-15T08:30:00Z").getTime())
		expect(result[0].windowStartMs).toBe(
			new Date("2024-01-15T08:30:00Z").getTime() - 240_000,
		)
	})

	it("track without durationMs becomes a point event", () => {
		const track = makeMusicTrack({
			playedAt: "2024-01-15T08:30:00Z",
			durationMs: undefined,
		})

		const result = computeTrackWindows([track])

		expect(result[0].windowStartMs).toBe(result[0].windowEndMs)
	})
})

describe("matchSongsToSets", () => {
	it("song overlapping one set matches only that set", () => {
		const sets = estimateSetTimings(
			[
				makeExercise({
					sets: [
						{ index: 0, type: "normal", weightKg: 100, reps: 8 },
						{ index: 1, type: "normal", weightKg: 100, reps: 8 },
					],
				}),
			],
			WORKOUT_START,
			WORKOUT_END,
		)
		// Each set is 30 min. Set 0: 08:00-08:30, Set 1: 08:30-09:00
		// Song plays 08:10 to 08:14 (within set 0 only)
		const tracks = computeTrackWindows([
			makeMusicTrack({
				playedAt: "2024-01-15T08:14:00Z",
				durationMs: 240_000,
			}),
		])

		const result = matchSongsToSets(sets, tracks)
		expect(result[0].matchedTracks).toHaveLength(1)
		expect(result[1].matchedTracks).toHaveLength(0)
	})

	it("song spanning two sets is assigned to the set with more overlap", () => {
		const sets = estimateSetTimings(
			[
				makeExercise({
					sets: [
						{ index: 0, type: "normal", weightKg: 100, reps: 8 },
						{ index: 1, type: "normal", weightKg: 100, reps: 8 },
					],
				}),
			],
			WORKOUT_START,
			WORKOUT_END,
		)
		// Each set is 30 min. Set 0: 08:00-08:30, Set 1: 08:30-09:00
		// Song plays 08:28 to 08:32 (spans the boundary, 2 min in set 0, 2 min in set 1)
		// Equal overlap → assigned to set 0 (first match wins)
		const tracks = computeTrackWindows([
			makeMusicTrack({
				playedAt: "2024-01-15T08:32:00Z",
				durationMs: 240_000,
			}),
		])

		const result = matchSongsToSets(sets, tracks)
		// Song assigned to only one set, not both
		const totalMatched = result[0].matchedTracks.length + result[1].matchedTracks.length
		expect(totalMatched).toBe(1)
	})

	it("song mostly in second set is assigned to second set only", () => {
		const sets = estimateSetTimings(
			[
				makeExercise({
					sets: [
						{ index: 0, type: "normal", weightKg: 100, reps: 8 },
						{ index: 1, type: "normal", weightKg: 100, reps: 8 },
					],
				}),
			],
			WORKOUT_START,
			WORKOUT_END,
		)
		// Each set is 30 min. Set 0: 08:00-08:30, Set 1: 08:30-09:00
		// Song plays 08:29 to 08:33 (1 min in set 0, 3 min in set 1)
		const tracks = computeTrackWindows([
			makeMusicTrack({
				playedAt: "2024-01-15T08:33:00Z",
				durationMs: 240_000,
			}),
		])

		const result = matchSongsToSets(sets, tracks)
		expect(result[0].matchedTracks).toHaveLength(0)
		expect(result[1].matchedTracks).toHaveLength(1)
	})

	it("song outside workout window matches nothing", () => {
		const sets = estimateSetTimings(
			[makeExercise()],
			WORKOUT_START,
			WORKOUT_END,
		)
		// Song plays at 10:00 — well after 09:00 workout end
		const tracks = computeTrackWindows([
			makeMusicTrack({
				playedAt: "2024-01-15T10:00:00Z",
				durationMs: 240_000,
			}),
		])

		const result = matchSongsToSets(sets, tracks)
		expect(result[0].matchedTracks).toHaveLength(0)
	})

	it("multiple songs on the same set all appear in chronological order", () => {
		const sets = estimateSetTimings(
			[makeExercise()],
			WORKOUT_START,
			WORKOUT_END,
		)
		// Pass tracks out of order to verify sorting
		const tracks = computeTrackWindows([
			makeMusicTrack({
				spotifyTrackId: "track-2",
				trackName: "Second Song",
				playedAt: "2024-01-15T08:08:00Z",
				durationMs: 240_000,
			}),
			makeMusicTrack({
				spotifyTrackId: "track-1",
				trackName: "First Song",
				playedAt: "2024-01-15T08:04:00Z",
				durationMs: 240_000,
			}),
		])

		const result = matchSongsToSets(sets, tracks)
		expect(result[0].matchedTracks).toHaveLength(2)
		expect(result[0].matchedTracks[0].spotifyTrackId).toBe("track-1")
		expect(result[0].matchedTracks[1].spotifyTrackId).toBe("track-2")
	})

	it("deduplicates same song played multiple times within a set", () => {
		const sets = estimateSetTimings(
			[makeExercise()],
			WORKOUT_START,
			WORKOUT_END,
		)
		// Same song played 3 times at different timestamps
		const tracks = computeTrackWindows([
			makeMusicTrack({
				spotifyTrackId: "track-1",
				playedAt: "2024-01-15T08:04:00Z",
				durationMs: 240_000,
			}),
			makeMusicTrack({
				spotifyTrackId: "track-1",
				playedAt: "2024-01-15T08:08:00Z",
				durationMs: 240_000,
			}),
			makeMusicTrack({
				spotifyTrackId: "track-1",
				playedAt: "2024-01-15T08:12:00Z",
				durationMs: 240_000,
			}),
		])

		const result = matchSongsToSets(sets, tracks)
		expect(result[0].matchedTracks).toHaveLength(1)
		expect(result[0].matchedTracks[0].spotifyTrackId).toBe("track-1")
	})
})

describe("buildWorkoutCards", () => {
	it("excludes workouts with no overlapping songs", () => {
		const workouts = [
			makeWorkoutInput(),
		]
		// Song played way after workout
		const tracks = [
			makeMusicTrack({ playedAt: "2024-01-15T12:00:00Z" }),
		]

		const result = buildWorkoutCards(workouts, tracks)
		expect(result).toHaveLength(0)
	})

	it("includes workout with matching songs and correct structure", () => {
		const workouts = [makeWorkoutInput()]
		const tracks = [
			makeMusicTrack({ playedAt: "2024-01-15T08:30:00Z", durationMs: 240_000 }),
		]

		const result = buildWorkoutCards(workouts, tracks)

		expect(result).toHaveLength(1)
		expect(result[0].title).toBe("Morning Push Day")
		expect(result[0].durationMinutes).toBe(60)
		expect(result[0].exercises).toHaveLength(1)
		expect(result[0].exercises[0].title).toBe("Bench Press (Barbell)")
		expect(result[0].exercises[0].sets[0].matchedTracks).toHaveLength(1)
		expect(result[0].exercises[0].sets[0].matchedTracks[0].trackName).toBe(
			"Test Song",
		)
	})

	it("sorts results by most recent workout first", () => {
		const workouts = [
			makeWorkoutInput({
				_id: "old",
				hevyWorkoutId: "hevy-old",
				title: "Old Workout",
				startTime: "2024-01-10T08:00:00Z",
				endTime: "2024-01-10T09:00:00Z",
			}),
			makeWorkoutInput({
				_id: "new",
				hevyWorkoutId: "hevy-new",
				title: "New Workout",
				startTime: "2024-01-20T08:00:00Z",
				endTime: "2024-01-20T09:00:00Z",
			}),
		]
		const tracks = [
			makeMusicTrack({ playedAt: "2024-01-10T08:30:00Z", durationMs: 240_000 }),
			makeMusicTrack({
				spotifyTrackId: "track-2",
				playedAt: "2024-01-20T08:30:00Z",
				durationMs: 240_000,
			}),
		]

		const result = buildWorkoutCards(workouts, tracks)

		expect(result).toHaveLength(2)
		expect(result[0].title).toBe("New Workout")
		expect(result[1].title).toBe("Old Workout")
	})

	it("groups sets back by exercise within a workout card", () => {
		const workouts = [
			makeWorkoutInput({
				exercises: [
					makeExercise({
						index: 0,
						title: "Bench Press",
						sets: [
							{ index: 0, type: "normal", weightKg: 100, reps: 8 },
							{ index: 1, type: "normal", weightKg: 100, reps: 8 },
						],
					}),
					makeExercise({
						index: 1,
						title: "Overhead Press",
						sets: [
							{ index: 0, type: "normal", weightKg: 60, reps: 10 },
						],
					}),
				],
			}),
		]
		const tracks = [
			makeMusicTrack({ playedAt: "2024-01-15T08:30:00Z", durationMs: 3_600_000 }),
		]

		const result = buildWorkoutCards(workouts, tracks)

		expect(result[0].exercises).toHaveLength(2)
		expect(result[0].exercises[0].title).toBe("Bench Press")
		expect(result[0].exercises[0].sets).toHaveLength(2)
		expect(result[0].exercises[1].title).toBe("Overhead Press")
		expect(result[0].exercises[1].sets).toHaveLength(1)
	})
})
