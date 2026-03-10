import { describe, it, expect, vi, beforeEach } from "vitest"
import type { PlayHistory, Track as SpotifyTrack } from "@spotify/web-api-ts-sdk"
import { mapSpotifyItemToTrack, refreshSpotifyToken, filterNewSpotifyTracks } from "../spotify.helpers"
import type { Track } from "../spotify.helpers"

function makeSpotifyTrack(overrides?: Partial<SpotifyTrack>): SpotifyTrack {
	return {
		id: "track-1",
		name: "Test Song",
		artists: [
			{ name: "Artist A", external_urls: { spotify: "" }, href: "", id: "a1", type: "artist", uri: "" },
		],
		album: {
			images: [
				{ url: "https://img.spotify.com/large.jpg", height: 640, width: 640 },
				{ url: "https://img.spotify.com/small.jpg", height: 64, width: 64 },
			],
			album_group: "",
			album_type: "album",
			artists: [],
			available_markets: [],
			copyrights: [],
			external_ids: { isrc: "", ean: "", upc: "" },
			external_urls: { spotify: "" },
			genres: [],
			href: "",
			id: "album-1",
			label: "",
			name: "Test Album",
			popularity: 0,
			release_date: "",
			release_date_precision: "day",
			total_tracks: 1,
			type: "album",
			uri: "",
		},
		duration_ms: 210000,
		external_urls: { spotify: "https://open.spotify.com/track/track-1" },
		available_markets: [],
		disc_number: 1,
		episode: false,
		explicit: false,
		href: "",
		is_local: false,
		preview_url: null,
		track: true,
		track_number: 1,
		type: "track",
		uri: "",
		external_ids: { isrc: "", ean: "", upc: "" },
		popularity: 50,
		...overrides,
	} as SpotifyTrack
}

function makePlayHistory(overrides?: Partial<PlayHistory>): PlayHistory {
	return {
		track: makeSpotifyTrack(),
		played_at: "2024-01-15T12:00:00Z",
		context: { type: "album", href: "", external_urls: { spotify: "" }, uri: "" },
		...overrides,
	}
}

describe("mapSpotifyItemToTrack", () => {
	it("maps a fully populated item correctly", () => {
		const item = makePlayHistory()
		const result = mapSpotifyItemToTrack(item)

		expect(result).toEqual({
			spotifyTrackId: "track-1",
			trackName: "Test Song",
			artistName: "Artist A",
			albumName: "Test Album",
			albumImageUrl: "https://img.spotify.com/large.jpg",
			playedAt: "2024-01-15T12:00:00Z",
			durationMs: 210000,
			trackUrl: "https://open.spotify.com/track/track-1",
		})
	})

	it("joins multiple artist names with comma separator", () => {
		const item = makePlayHistory({
			track: makeSpotifyTrack({
				artists: [
					{ name: "Artist A", external_urls: { spotify: "" }, href: "", id: "a1", type: "artist", uri: "" },
					{ name: "Artist B", external_urls: { spotify: "" }, href: "", id: "a2", type: "artist", uri: "" },
					{ name: "Artist C", external_urls: { spotify: "" }, href: "", id: "a3", type: "artist", uri: "" },
				],
			}),
		})
		const result = mapSpotifyItemToTrack(item)

		expect(result.artistName).toBe("Artist A, Artist B, Artist C")
	})

	it("uses first album image URL when multiple images exist", () => {
		const item = makePlayHistory()
		const result = mapSpotifyItemToTrack(item)

		expect(result.albumImageUrl).toBe("https://img.spotify.com/large.jpg")
	})

	it("handles empty images array", () => {
		const track = makeSpotifyTrack()
		track.album.images = []
		const item = makePlayHistory({ track })
		const result = mapSpotifyItemToTrack(item)

		expect(result.albumImageUrl).toBeUndefined()
	})
})

describe("refreshSpotifyToken", () => {
	beforeEach(() => {
		vi.restoreAllMocks()
	})

	it("returns parsed tokens on success", async () => {
		const mockTokens = {
			access_token: "new-access-token",
			refresh_token: "new-refresh-token",
			expires_in: 3600,
		}
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(mockTokens),
			}),
		)

		const result = await refreshSpotifyToken(
			"old-refresh-token",
			"client-id",
			"client-secret",
		)

		expect(result).toEqual(mockTokens)
	})

	it("sends correct Authorization header and form body", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({}),
		})
		vi.stubGlobal("fetch", fetchMock)

		await refreshSpotifyToken("my-refresh-token", "my-client-id", "my-secret")

		expect(fetchMock).toHaveBeenCalledWith(
			"https://accounts.spotify.com/api/token",
			expect.objectContaining({
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					Authorization: `Basic ${btoa("my-client-id:my-secret")}`,
				},
			}),
		)

		const callBody = fetchMock.mock.calls[0][1].body as URLSearchParams
		expect(callBody.get("grant_type")).toBe("refresh_token")
		expect(callBody.get("refresh_token")).toBe("my-refresh-token")
	})

	it("returns null on non-ok response", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({ ok: false, status: 401 }),
		)

		const result = await refreshSpotifyToken(
			"bad-token",
			"client-id",
			"client-secret",
		)

		expect(result).toBeNull()
	})
})

describe("filterNewSpotifyTracks", () => {
	function makeTrack(overrides?: Partial<Track>): Track {
		return {
			spotifyTrackId: "track-1",
			trackName: "Test Song",
			artistName: "Artist A",
			albumName: "Test Album",
			playedAt: "2024-01-15T12:00:00Z",
			...overrides,
		}
	}

	it("filters out tracks that already exist", () => {
		const tracks = [
			makeTrack({ spotifyTrackId: "t1", playedAt: "2024-01-15T12:00:00Z" }),
			makeTrack({ spotifyTrackId: "t2", playedAt: "2024-01-15T12:05:00Z" }),
		]
		const existing = new Set(["t1:2024-01-15T12:00:00Z"])
		const result = filterNewSpotifyTracks(tracks, existing)

		expect(result).toHaveLength(1)
		expect(result[0].spotifyTrackId).toBe("t2")
	})

	it("keeps same track played at different times", () => {
		const tracks = [
			makeTrack({ spotifyTrackId: "t1", playedAt: "2024-01-15T12:00:00Z" }),
			makeTrack({ spotifyTrackId: "t1", playedAt: "2024-01-15T14:00:00Z" }),
		]
		const existing = new Set(["t1:2024-01-15T12:00:00Z"])
		const result = filterNewSpotifyTracks(tracks, existing)

		expect(result).toHaveLength(1)
		expect(result[0].playedAt).toBe("2024-01-15T14:00:00Z")
	})

	it("returns all tracks when no existing keys", () => {
		const tracks = [
			makeTrack({ spotifyTrackId: "t1" }),
			makeTrack({ spotifyTrackId: "t2" }),
		]
		const result = filterNewSpotifyTracks(tracks, new Set())

		expect(result).toHaveLength(2)
	})

	it("returns empty array when all tracks are duplicates", () => {
		const tracks = [
			makeTrack({ spotifyTrackId: "t1", playedAt: "2024-01-15T12:00:00Z" }),
		]
		const existing = new Set(["t1:2024-01-15T12:00:00Z"])
		const result = filterNewSpotifyTracks(tracks, existing)

		expect(result).toHaveLength(0)
	})

	it("handles empty input", () => {
		const result = filterNewSpotifyTracks([], new Set(["t1:2024-01-15T12:00:00Z"]))

		expect(result).toHaveLength(0)
	})
})
