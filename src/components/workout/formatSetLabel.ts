import type { SetWithSongs } from "../../../convex/matching"

export function formatSetLabel(set: SetWithSongs): string {
	const typePrefix = set.setType === "warmup" ? "Warmup" : `Set ${set.setIndex + 1}`
	const parts: string[] = [typePrefix]

	if (set.weightKg != null) {
		parts.push(`${Math.round(set.weightKg)}kg`)
	}
	if (set.reps != null) {
		parts.push(`${set.reps} reps`)
	}
	if (set.distanceMeters != null) {
		parts.push(`${set.distanceMeters}m`)
	}
	if (set.durationSeconds != null) {
		const mins = Math.floor(set.durationSeconds / 60)
		const secs = set.durationSeconds % 60
		parts.push(mins > 0 ? `${mins}m${secs > 0 ? ` ${secs}s` : ""}` : `${secs}s`)
	}
	if (set.rpe != null) {
		parts.push(`RPE ${set.rpe}`)
	}

	return parts.join(" · ")
}
