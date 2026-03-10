// Pure matching logic — no Convex imports.
// Correlates Spotify tracks to workout sets by estimating set timing.

export type Exercise = {
	index: number
	title: string
	notes?: string
	exerciseTemplateId: string
	supersetsId?: number
	sets: Set[]
}

export type Set = {
	index: number
	type: string
	weightKg?: number
	reps?: number
	distanceMeters?: number
	durationSeconds?: number
	rpe?: number
	customMetric?: number
}

export type MusicTrack = {
	spotifyTrackId: string
	trackName: string
	artistName: string
	albumName: string
	albumImageUrl?: string
	playedAt: string
	durationMs?: number
	trackUrl?: string
}

export type SetWithTiming = {
	exerciseIndex: number
	exerciseTitle: string
	setIndex: number
	setType: string
	weightKg?: number
	reps?: number
	distanceMeters?: number
	durationSeconds?: number
	rpe?: number
	estimatedStartMs: number
	estimatedEndMs: number
}

export type TrackWindow = MusicTrack & {
	windowStartMs: number
	windowEndMs: number
}

export type SetWithSongs = SetWithTiming & {
	matchedTracks: TrackWindow[]
}

export type WorkoutWithSongs = {
	workoutId: string
	hevyWorkoutId: string
	title: string
	description?: string
	startTime: string
	endTime: string
	durationMinutes: number
	exercises: {
		title: string
		notes?: string
		sets: SetWithSongs[]
	}[]
}

const SET_WEIGHT: Record<string, number> = {
	warmup: 0.5,
}
const DEFAULT_SET_WEIGHT = 1.0

function getSetWeight(setType: string): number {
	return SET_WEIGHT[setType] ?? DEFAULT_SET_WEIGHT
}

export function estimateSetTimings(
	exercises: Exercise[],
	workoutStartMs: number,
	workoutEndMs: number,
): SetWithTiming[] {
	const flatSets: { exerciseIndex: number; exerciseTitle: string; set: Set }[] =
		[]

	for (const exercise of exercises) {
		for (const set of exercise.sets) {
			flatSets.push({
				exerciseIndex: exercise.index,
				exerciseTitle: exercise.title,
				set,
			})
		}
	}

	if (flatSets.length === 0) return []

	const totalWeight = flatSets.reduce(
		(sum, s) => sum + getSetWeight(s.set.type),
		0,
	)
	const totalDuration = workoutEndMs - workoutStartMs

	let currentMs = workoutStartMs
	return flatSets.map(({ exerciseIndex, exerciseTitle, set }) => {
		const fraction = getSetWeight(set.type) / totalWeight
		const setDuration = totalDuration * fraction
		const startMs = currentMs
		const endMs = currentMs + setDuration
		currentMs = endMs

		return {
			exerciseIndex,
			exerciseTitle,
			setIndex: set.index,
			setType: set.type,
			weightKg: set.weightKg,
			reps: set.reps,
			distanceMeters: set.distanceMeters,
			durationSeconds: set.durationSeconds,
			rpe: set.rpe,
			estimatedStartMs: startMs,
			estimatedEndMs: endMs,
		}
	})
}

export function computeTrackWindows(tracks: MusicTrack[]): TrackWindow[] {
	return tracks.map((track) => {
		const endMs = new Date(track.playedAt).getTime()
		const startMs = track.durationMs ? endMs - track.durationMs : endMs
		return { ...track, windowStartMs: startMs, windowEndMs: endMs }
	})
}

function overlapMs(
	aStart: number,
	aEnd: number,
	bStart: number,
	bEnd: number,
): number {
	return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart))
}

export function matchSongsToSets(
	sets: SetWithTiming[],
	trackWindows: TrackWindow[],
): SetWithSongs[] {
	// Assign each track to the single set with the greatest overlap.
	// This prevents the same song from appearing on every set it touches.
	const setTracks = new Map<number, TrackWindow[]>()
	for (let i = 0; i < sets.length; i++) {
		setTracks.set(i, [])
	}

	for (const tw of trackWindows) {
		let bestIdx = -1
		let bestOverlap = 0

		for (let i = 0; i < sets.length; i++) {
			const set = sets[i]
			const overlap = overlapMs(
				tw.windowStartMs,
				tw.windowEndMs,
				set.estimatedStartMs,
				set.estimatedEndMs,
			)
			if (overlap > bestOverlap) {
				bestOverlap = overlap
				bestIdx = i
			}
		}

		if (bestIdx >= 0) {
			setTracks.get(bestIdx)!.push(tw)
		}
	}

	return sets.map((set, i) => {
		const tracks = setTracks.get(i) ?? []

		// Deduplicate by spotifyTrackId — same song played multiple times only shows once
		const seen = new Set<string>()
		const deduped: TrackWindow[] = []
		for (const tw of tracks) {
			if (!seen.has(tw.spotifyTrackId)) {
				seen.add(tw.spotifyTrackId)
				deduped.push(tw)
			}
		}

		// Sort chronologically by when the track started playing
		deduped.sort((a, b) => a.windowStartMs - b.windowStartMs)

		return { ...set, matchedTracks: deduped }
	})
}

type WorkoutInput = {
	_id: string
	hevyWorkoutId: string
	title: string
	description?: string
	startTime: string
	endTime: string
	exercises: Exercise[]
}

export function buildWorkoutCards(
	workouts: WorkoutInput[],
	musicTracks: MusicTrack[],
): WorkoutWithSongs[] {
	const allTrackWindows = computeTrackWindows(musicTracks)

	const cards: WorkoutWithSongs[] = []

	for (const workout of workouts) {
		const workoutStartMs = new Date(workout.startTime).getTime()
		const workoutEndMs = new Date(workout.endTime).getTime()

		// Pre-filter tracks to this workout's time window
		const relevantTracks = allTrackWindows.filter(
			(tw) => tw.windowStartMs < workoutEndMs && tw.windowEndMs > workoutStartMs,
		)

		if (relevantTracks.length === 0) continue

		const setTimings = estimateSetTimings(
			workout.exercises,
			workoutStartMs,
			workoutEndMs,
		)
		const setsWithSongs = matchSongsToSets(setTimings, relevantTracks)

		// Check if any set actually matched a song
		const hasAnySong = setsWithSongs.some((s) => s.matchedTracks.length > 0)
		if (!hasAnySong) continue

		// Build a lookup for exercise notes
		const exerciseNotes = new Map<string, string | undefined>()
		for (const exercise of workout.exercises) {
			const key = `${exercise.index}-${exercise.title}`
			exerciseNotes.set(key, exercise.notes)
		}

		// Group sets back by exercise
		const exerciseMap = new Map<
			string,
			{ title: string; notes?: string; sets: SetWithSongs[] }
		>()
		for (const set of setsWithSongs) {
			const key = `${set.exerciseIndex}-${set.exerciseTitle}`
			if (!exerciseMap.has(key)) {
				exerciseMap.set(key, { title: set.exerciseTitle, notes: exerciseNotes.get(key), sets: [] })
			}
			exerciseMap.get(key)!.sets.push(set)
		}

		const durationMinutes = Math.round(
			(workoutEndMs - workoutStartMs) / 60_000,
		)

		cards.push({
			workoutId: workout._id,
			hevyWorkoutId: workout.hevyWorkoutId,
			title: workout.title,
			description: workout.description,
			startTime: workout.startTime,
			endTime: workout.endTime,
			durationMinutes,
			exercises: Array.from(exerciseMap.values()),
		})
	}

	// Sort most recent first
	cards.sort(
		(a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
	)

	return cards
}
