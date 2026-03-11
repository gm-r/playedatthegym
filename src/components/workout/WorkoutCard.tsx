import { useState } from "react"
import { Share2, Check } from "lucide-react"
import type { WorkoutWithSongs } from "../../../convex/matching"
import { ExerciseSection } from "./ExerciseSection"

function formatDuration(totalMinutes: number): string {
	const hours = Math.floor(totalMinutes / 60)
	const mins = totalMinutes % 60
	if (hours === 0) return `${mins} min`
	if (mins === 0) return `${hours}h`
	return `${hours}h ${mins} min`
}

export function WorkoutCard({
	card,
	shareUrl,
}: { card: WorkoutWithSongs; shareUrl?: string }) {
	const [copied, setCopied] = useState(false)

	const startDate = new Date(card.startTime)
	const date = startDate.toLocaleDateString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
		year: "numeric",
	})
	const time = startDate.toLocaleTimeString(undefined, {
		hour: "numeric",
		minute: "2-digit",
	})

	const totalVolume = card.exercises.reduce(
		(sum, ex) =>
			sum +
			ex.sets.reduce(
				(setSum, set) => setSum + (set.weightKg ?? 0) * (set.reps ?? 0),
				0,
			),
		0,
	)
	const volumeLabel =
		totalVolume >= 1000
			? `${(totalVolume / 1000).toFixed(1)}k kg`
			: `${Math.round(totalVolume)} kg`

	const handleShare = async () => {
		if (!shareUrl) return
		const fullUrl = `${window.location.origin}${shareUrl}`
		await navigator.clipboard.writeText(fullUrl)
		setCopied(true)
		setTimeout(() => setCopied(false), 2000)
	}

	return (
		<div className="feature-card rounded-2xl border border-[var(--line)] p-5">
			<div className="mb-4">
				<div className="flex items-center justify-between">
					<h3 className="text-lg font-bold text-[var(--sea-ink)]">
						{card.title} — {volumeLabel}
					</h3>
					{shareUrl && (
						<button
							type="button"
							onClick={handleShare}
							className="shrink-0 rounded-full p-1.5 text-[var(--sea-ink-soft)] transition hover:bg-[var(--chip-bg)] hover:text-[var(--sea-ink)]"
							title={copied ? "Copied!" : "Copy share link"}
						>
							{copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
						</button>
					)}
				</div>
				<p className="mt-1 text-sm text-[var(--sea-ink-soft)]">
					{date} &middot; {time} &middot; {formatDuration(card.durationMinutes)}
				</p>
			</div>
			{card.description && (
				<p className="mb-4 text-sm italic text-[var(--sea-ink-soft)]">
					{card.description}
				</p>
			)}

			<div className="space-y-4">
				{card.exercises.map((exercise, i) => (
					<ExerciseSection key={i} exercise={exercise} />
				))}
			</div>
		</div>
	)
}
