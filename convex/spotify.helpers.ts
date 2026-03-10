import type { PlayHistory } from "@spotify/web-api-ts-sdk"

export type Track = {
	spotifyTrackId: string
	trackName: string
	artistName: string
	albumName: string
	albumImageUrl?: string
	playedAt: string
	durationMs?: number
	trackUrl?: string
}

export function mapSpotifyItemToTrack(item: PlayHistory): Track {
	return {
		spotifyTrackId: item.track.id,
		trackName: item.track.name,
		artistName: item.track.artists.map((a) => a.name).join(", "),
		albumName: item.track.album.name,
		albumImageUrl: item.track.album.images[0]?.url,
		playedAt: item.played_at,
		durationMs: item.track.duration_ms,
		trackUrl: item.track.external_urls.spotify,
	}
}

export function filterNewSpotifyTracks(
	tracks: Track[],
	existingKeys: Set<string>,
): Track[] {
	return tracks.filter(
		(t) => !existingKeys.has(`${t.spotifyTrackId}:${t.playedAt}`),
	)
}

export async function refreshSpotifyToken(
	refreshToken: string,
	clientId: string,
	clientSecret: string,
) {
	const response = await fetch("https://accounts.spotify.com/api/token", {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
		},
		body: new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: refreshToken,
		}),
	})
	if (!response.ok) return null
	return await response.json()
}
