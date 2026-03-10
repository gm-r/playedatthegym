import type { TrackWindow } from "../../../convex/matching"

export function SongPill({ track }: { track: TrackWindow }) {
	return (
		<a
			href={track.trackUrl}
			target="_blank"
			rel="noopener noreferrer"
			className="inline-flex items-center gap-1.5 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-2.5 py-0.5 transition-colors hover:bg-[var(--link-bg-hover)]"
		>
			{track.albumImageUrl && (
				<img
					src={track.albumImageUrl}
					alt={track.albumName}
					className="h-5 w-5 rounded-full"
				/>
			)}
			<span className="max-w-[10rem] truncate text-xs font-medium text-[var(--sea-ink)]">
				{track.trackName}
			</span>
			<span className="max-w-[6rem] truncate text-xs text-[var(--sea-ink-soft)]">
				{track.artistName}
			</span>
		</a>
	)
}
