import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ActionCtx } from "../_generated/server"

// Mock Convex generated modules
vi.mock("../_generated/api", () => ({
	internal: {
		spotify: {
			getTokens: "internal:spotify:getTokens",
			updateTokens: "internal:spotify:updateTokens",
			storeTracks: "internal:spotify:storeTracks",
		},
	},
}))

vi.mock("../_generated/server", () => ({
	action: (config: { handler: unknown }) => config.handler,
	internalQuery: (config: { handler: unknown }) => config.handler,
	internalMutation: (config: { handler: unknown }) => config.handler,
}))

// Mock auth
const mockGetAuthUserId = vi.fn()
vi.mock("@convex-dev/auth/server", () => ({
	getAuthUserId: (...args: unknown[]) => mockGetAuthUserId(...args),
}))

// Mock Spotify SDK
const mockGetRecentlyPlayedTracks = vi.fn()
const mockWithAccessToken = vi.fn().mockReturnValue({
	player: { getRecentlyPlayedTracks: mockGetRecentlyPlayedTracks },
})
vi.mock("@spotify/web-api-ts-sdk", () => ({
	SpotifyApi: { withAccessToken: (...args: unknown[]) => mockWithAccessToken(...args) },
}))

// Mock refreshSpotifyToken
const mockRefreshSpotifyToken = vi.fn()
vi.mock("../spotify.helpers", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../spotify.helpers")>()
	return {
		...actual,
		refreshSpotifyToken: (...args: unknown[]) => mockRefreshSpotifyToken(...args),
	}
})

// Import after all mocks are set up
const { getRecentlyPlayedHandler } = await import("../spotify")

const FAKE_USER_ID = "user123" as any
const FAKE_TOKEN_DOC_ID = "tokenDoc456" as any
const NOW = 1700000000000

function createMockCtx() {
	return {
		runQuery: vi.fn(),
		runMutation: vi.fn(),
		runAction: vi.fn(),
		auth: {},
	} as unknown as ActionCtx
}

function makeTokenDoc(overrides?: Record<string, unknown>) {
	return {
		_id: FAKE_TOKEN_DOC_ID,
		_creationTime: NOW - 100000,
		userId: FAKE_USER_ID,
		accessToken: "valid-access-token",
		refreshToken: "valid-refresh-token",
		expiresAt: NOW + 3600000, // 1 hour from now (valid)
		spotifyUserId: "spotify-user-1",
		...overrides,
	}
}

function makeSpotifyResponse(items: unknown[] = []) {
	return {
		items:
			items.length > 0
				? items
				: [
						{
							track: {
								id: "track-1",
								name: "Test Song",
								artists: [{ name: "Artist A" }],
								album: {
									name: "Test Album",
									images: [{ url: "https://img.spotify.com/large.jpg" }],
								},
								duration_ms: 210000,
								external_urls: { spotify: "https://open.spotify.com/track/track-1" },
							},
							played_at: "2024-01-15T12:00:00Z",
						},
					],
	}
}

describe("getRecentlyPlayedHandler", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(NOW)
		vi.clearAllMocks()
	})

	it("returns mapped tracks when token is valid", async () => {
		const ctx = createMockCtx()
		mockGetAuthUserId.mockResolvedValue(FAKE_USER_ID)
		;(ctx.runQuery as ReturnType<typeof vi.fn>).mockResolvedValue(makeTokenDoc())
		mockGetRecentlyPlayedTracks.mockResolvedValue(makeSpotifyResponse())

		const result = await getRecentlyPlayedHandler(ctx)

		expect(result).toHaveLength(1)
		expect(result[0]).toMatchObject({
			spotifyTrackId: "track-1",
			trackName: "Test Song",
			artistName: "Artist A",
		})

		// Should NOT have called updateTokens (token was valid)
		expect(ctx.runMutation).toHaveBeenCalledTimes(1)
		expect(ctx.runMutation).toHaveBeenCalledWith(
			"internal:spotify:storeTracks",
			expect.objectContaining({ userId: FAKE_USER_ID }),
		)
	})

	it("refreshes token when expired and uses new access token", async () => {
		const ctx = createMockCtx()
		mockGetAuthUserId.mockResolvedValue(FAKE_USER_ID)
		;(ctx.runQuery as ReturnType<typeof vi.fn>).mockResolvedValue(
			makeTokenDoc({ expiresAt: NOW - 1000 }), // expired
		)
		mockRefreshSpotifyToken.mockResolvedValue({
			access_token: "new-access-token",
			refresh_token: "new-refresh-token",
			expires_in: 3600,
		})
		mockGetRecentlyPlayedTracks.mockResolvedValue(makeSpotifyResponse())

		await getRecentlyPlayedHandler(ctx)

		// Should have called updateTokens with new tokens
		expect(ctx.runMutation).toHaveBeenCalledWith(
			"internal:spotify:updateTokens",
			expect.objectContaining({
				tokenDocId: FAKE_TOKEN_DOC_ID,
				accessToken: "new-access-token",
				refreshToken: "new-refresh-token",
			}),
		)

		// SDK should have been created with the NEW access token
		expect(mockWithAccessToken).toHaveBeenCalledWith(
			"test-client-id",
			expect.objectContaining({ access_token: "new-access-token" }),
		)
	})

	it("throws when not authenticated", async () => {
		const ctx = createMockCtx()
		mockGetAuthUserId.mockResolvedValue(null)

		await expect(getRecentlyPlayedHandler(ctx)).rejects.toThrow(
			"Not authenticated",
		)

		expect(ctx.runQuery).not.toHaveBeenCalled()
	})

	it("throws when no tokens found", async () => {
		const ctx = createMockCtx()
		mockGetAuthUserId.mockResolvedValue(FAKE_USER_ID)
		;(ctx.runQuery as ReturnType<typeof vi.fn>).mockResolvedValue(null)

		await expect(getRecentlyPlayedHandler(ctx)).rejects.toThrow(
			"No Spotify tokens found",
		)
	})

	it("throws when token refresh fails", async () => {
		const ctx = createMockCtx()
		mockGetAuthUserId.mockResolvedValue(FAKE_USER_ID)
		;(ctx.runQuery as ReturnType<typeof vi.fn>).mockResolvedValue(
			makeTokenDoc({ expiresAt: NOW - 1000 }),
		)
		mockRefreshSpotifyToken.mockResolvedValue(null)

		await expect(getRecentlyPlayedHandler(ctx)).rejects.toThrow(
			"Failed to refresh Spotify token",
		)

		// Should NOT have called updateTokens or storeTracks
		expect(ctx.runMutation).not.toHaveBeenCalled()
	})

	it("propagates Spotify API errors", async () => {
		const ctx = createMockCtx()
		mockGetAuthUserId.mockResolvedValue(FAKE_USER_ID)
		;(ctx.runQuery as ReturnType<typeof vi.fn>).mockResolvedValue(makeTokenDoc())
		mockGetRecentlyPlayedTracks.mockRejectedValue(
			new Error("Spotify API: 502 Bad Gateway"),
		)

		await expect(getRecentlyPlayedHandler(ctx)).rejects.toThrow(
			"Spotify API: 502 Bad Gateway",
		)
	})

	it("handles empty recently played list", async () => {
		const ctx = createMockCtx()
		mockGetAuthUserId.mockResolvedValue(FAKE_USER_ID)
		;(ctx.runQuery as ReturnType<typeof vi.fn>).mockResolvedValue(makeTokenDoc())
		mockGetRecentlyPlayedTracks.mockResolvedValue({ items: [] })

		const result = await getRecentlyPlayedHandler(ctx)

		expect(result).toEqual([])
		expect(ctx.runMutation).toHaveBeenCalledWith(
			"internal:spotify:storeTracks",
			{ userId: FAKE_USER_ID, tracks: [] },
		)
	})
})
