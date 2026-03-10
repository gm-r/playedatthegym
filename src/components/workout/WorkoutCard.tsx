import { useState } from "react"
import { Share2, Check } from "lucide-react"
import type { WorkoutWithSongs } from "../../../convex/matching"
import { ExerciseSection } from "./ExerciseSection"

export function WorkoutCard({
	card,
	shareUrl,
}: { card: WorkoutWithSongs; shareUrl?: string }) {
	const [copied, setCopied] = useState(false)

	const date = new Date(card.startTime).toLocaleDateString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
		year: "numeric",
	})

	const handleShare = async () => {
		if (!shareUrl) return
		const fullUrl = `${window.location.origin}${shareUrl}`
		await navigator.clipboard.writeText(fullUrl)
		setCopied(true)
		setTimeout(() => setCopied(false), 2000)
	}

	return (
		<div className="feature-card rounded-2xl border border-[var(--line)] p-5">
			<div className="mb-4 flex items-center justify-between">
				<h3 className="text-lg font-bold text-[var(--sea-ink)]">
					{card.title}
				</h3>
				<div className="flex items-center gap-2">
					<span className="text-sm text-[var(--sea-ink-soft)]">
						{date} &middot; {card.durationMinutes} min
					</span>
					{shareUrl && (
						<button
							type="button"
							onClick={handleShare}
							className="rounded-full p-1.5 text-[var(--sea-ink-soft)] transition hover:bg-[var(--chip-bg)] hover:text-[var(--sea-ink)]"
							title={copied ? "Copied!" : "Copy share link"}
						>
							{copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
						</button>
					)}
				</div>
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
