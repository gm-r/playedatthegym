import type { SetWithSongs, TrackWindow } from "../../../convex/matching"
import { formatSetLabel } from "./formatSetLabel"
import { SongPill } from "./SongPill"

export function SetRow({ set }: { set: SetWithSongs }) {
	const label = formatSetLabel(set)

	return (
		<div className="flex flex-wrap items-start gap-3 rounded-lg bg-[var(--surface)] px-3 py-2">
			<span className="shrink-0 text-sm text-[var(--sea-ink)]">{label}</span>
			{set.matchedTracks.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{set.matchedTracks.map((track: TrackWindow) => (
						<SongPill key={`${track.spotifyTrackId}-${track.playedAt}`} track={track} />
					))}
				</div>
			)}
		</div>
	)
}
