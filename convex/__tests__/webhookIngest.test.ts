import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock Convex generated modules
vi.mock("../_generated/api", () => ({
	internal: {
		spotify: {
			getTokens: "internal:spotify:getTokens",
			updateTokens: "internal:spotify:updateTokens",
			storeTracks: "internal:spotify:storeTracks",
			getExistingTrackKeys: "internal:spotify:getExistingTrackKeys",
		},
		hevy: {
			getExistingWorkoutIds: "internal:hevy:getExistingWorkoutIds",
			storeWorkouts: "internal:hevy:storeWorkouts",
		},
	},
}))

let capturedHandler: (ctx: unknown, args: { userId: any; apiKey: string; workoutId: string }) => Promise<null>

vi.mock("../_generated/server", () => ({
	internalAction: (config: { handler: (ctx: unknown, args: any) => Promise<null> }) => {
		capturedHandler = config.handler
		return config.handler
	},
	internalQuery: (config: { handler: unknown }) => config.handler,
	internalMutation: (config: { handler: unknown }) => config.handler,
	action: (config: { handler: unknown }) => config.handler,
}))

// Mock Spotify SDK
const mockGetRecentlyPlayedTracks = vi.fn()
const mockWithAccessToken = vi.fn().mockReturnValue({
	player: {
		getRecentlyPlayedTracks: mockGetRecentlyPlayedTracks,
	},
})
vi.mock("@spotify/web-api-ts-sdk", () => ({
	SpotifyApi: {
		withAccessToken: (...args: unknown[]) => mockWithAccessToken(...args),
	},
}))

// Mock spotify helpers
const mockRefreshSpotifyToken = vi.fn()
vi.mock("../spotify.helpers", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../spotify.helpers")>()
	return {
		...actual,
		refreshSpotifyToken: (...args: unknown[]) => mockRefreshSpotifyToken(...args),
	}
})

// Import after mocks
await import("../webhookIngest")

const FAKE_USER_ID = "user123" as any
const FAKE_TOKEN_DOC_ID = "tokenDoc456" as any
const NOW = 1700000000000

function createMockCtx() {
	return {
		runQuery: vi.fn(),
		runMutation: vi.fn(),
	}
}

function makeHevyApiWorkout(overrides = {}) {
	return {
		id: "workout-abc",
		title: "Push Day",
		routine_id: null,
		description: null,
		start_time: "2024-01-16T08:00:00Z",
		end_time: "2024-01-16T09:00:00Z",
		updated_at: "2024-01-16T09:00:00Z",
		created_at: "2024-01-16T08:00:00Z",
		exercises: [],
		...overrides,
	}
}

function makeTokenDoc(overrides?: Record<string, unknown>) {
	return {
		_id: FAKE_TOKEN_DOC_ID,
		_creationTime: NOW - 100000,
		userId: FAKE_USER_ID,
		accessToken: "valid-access-token",
		refreshToken: "valid-refresh-token",
		expiresAt: NOW + 3600000,
		spotifyUserId: "spotify-user-1",
		...overrides,
	}
}

function makeSpotifyResponse() {
	return {
		items: [
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
					external_urls: {
						spotify: "https://open.spotify.com/track/track-1",
					},
				},
				played_at: "2024-01-16T08:30:00Z",
			},
		],
	}
}

describe("ingestWorkout", () => {
	let originalEnv: NodeJS.ProcessEnv

	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(NOW)
		vi.clearAllMocks()
		originalEnv = { ...process.env }
		process.env.AUTH_SPOTIFY_ID = "test-client-id"
		process.env.AUTH_SPOTIFY_SECRET = "test-client-secret"
	})

	afterEach(() => {
		process.env = originalEnv
		vi.useRealTimers()
	})

	it("returns null when Hevy API returns error", async () => {
		const ctx = createMockCtx()

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({ ok: false, status: 404 }),
		)

		const result = await capturedHandler(ctx, {
			userId: FAKE_USER_ID,
			apiKey: "test-key",
			workoutId: "bad-id",
		})

		expect(result).toBeNull()
		expect(ctx.runMutation).not.toHaveBeenCalled()
	})

	it("fetches workout by ID and stores it", async () => {
		const ctx = createMockCtx()
		ctx.runQuery.mockResolvedValueOnce([]) // getExistingWorkoutIds
		ctx.runQuery.mockResolvedValueOnce(makeTokenDoc()) // getTokens
		ctx.runQuery.mockResolvedValueOnce([]) // getExistingTrackKeys

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(makeHevyApiWorkout()),
			}),
		)
		mockGetRecentlyPlayedTracks.mockResolvedValue(makeSpotifyResponse())

		await capturedHandler(ctx, {
			userId: FAKE_USER_ID,
			apiKey: "test-key",
			workoutId: "workout-abc",
		})

		// Verify fetch was called with correct URL
		expect(fetch).toHaveBeenCalledWith(
			"https://api.hevyapp.com/v1/workouts/workout-abc",
			{ headers: { "api-key": "test-key" } },
		)

		// Stored workout
		expect(ctx.runMutation).toHaveBeenCalledWith(
			"internal:hevy:storeWorkouts",
			expect.objectContaining({
				userId: FAKE_USER_ID,
				workouts: expect.arrayContaining([
					expect.objectContaining({ hevyWorkoutId: "workout-abc" }),
				]),
			}),
		)
	})

	it("skips storing duplicate workout", async () => {
		const ctx = createMockCtx()
		ctx.runQuery.mockResolvedValueOnce(["workout-abc"]) // already exists
		ctx.runQuery.mockResolvedValueOnce(makeTokenDoc())
		ctx.runQuery.mockResolvedValueOnce([])

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(makeHevyApiWorkout()),
			}),
		)
		mockGetRecentlyPlayedTracks.mockResolvedValue(makeSpotifyResponse())

		await capturedHandler(ctx, {
			userId: FAKE_USER_ID,
			apiKey: "test-key",
			workoutId: "workout-abc",
		})

		expect(ctx.runMutation).not.toHaveBeenCalledWith(
			"internal:hevy:storeWorkouts",
			expect.anything(),
		)
		// Still stores Spotify tracks
		expect(ctx.runMutation).toHaveBeenCalledWith(
			"internal:spotify:storeTracks",
			expect.anything(),
		)
	})

	it("skips music sync when no Spotify tokens", async () => {
		const ctx = createMockCtx()
		ctx.runQuery.mockResolvedValueOnce([]) // getExistingWorkoutIds
		ctx.runQuery.mockResolvedValueOnce(null) // no Spotify tokens

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(makeHevyApiWorkout()),
			}),
		)

		await capturedHandler(ctx, {
			userId: FAKE_USER_ID,
			apiKey: "test-key",
			workoutId: "workout-abc",
		})

		expect(ctx.runMutation).toHaveBeenCalledWith(
			"internal:hevy:storeWorkouts",
			expect.anything(),
		)
		expect(ctx.runMutation).not.toHaveBeenCalledWith(
			"internal:spotify:storeTracks",
			expect.anything(),
		)
	})

	it("refreshes expired Spotify token", async () => {
		const ctx = createMockCtx()
		ctx.runQuery.mockResolvedValueOnce([])
		ctx.runQuery.mockResolvedValueOnce(makeTokenDoc({ expiresAt: NOW - 1000 }))
		ctx.runQuery.mockResolvedValueOnce([])

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(makeHevyApiWorkout()),
			}),
		)
		mockRefreshSpotifyToken.mockResolvedValue({
			access_token: "new-access-token",
			refresh_token: "new-refresh-token",
			expires_in: 3600,
		})
		mockGetRecentlyPlayedTracks.mockResolvedValue(makeSpotifyResponse())

		await capturedHandler(ctx, {
			userId: FAKE_USER_ID,
			apiKey: "test-key",
			workoutId: "workout-abc",
		})

		expect(mockRefreshSpotifyToken).toHaveBeenCalledWith(
			"valid-refresh-token",
			"test-client-id",
			"test-client-secret",
		)
		expect(ctx.runMutation).toHaveBeenCalledWith(
			"internal:spotify:updateTokens",
			expect.objectContaining({
				tokenDocId: FAKE_TOKEN_DOC_ID,
				accessToken: "new-access-token",
			}),
		)
	})

	it("skips music sync when token refresh fails", async () => {
		const ctx = createMockCtx()
		ctx.runQuery.mockResolvedValueOnce([])
		ctx.runQuery.mockResolvedValueOnce(makeTokenDoc({ expiresAt: NOW - 1000 }))

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(makeHevyApiWorkout()),
			}),
		)
		mockRefreshSpotifyToken.mockResolvedValue(null)

		await capturedHandler(ctx, {
			userId: FAKE_USER_ID,
			apiKey: "test-key",
			workoutId: "workout-abc",
		})

		expect(ctx.runMutation).not.toHaveBeenCalledWith(
			"internal:spotify:storeTracks",
			expect.anything(),
		)
	})

	it("deduplicates Spotify tracks", async () => {
		const ctx = createMockCtx()
		ctx.runQuery.mockResolvedValueOnce([])
		ctx.runQuery.mockResolvedValueOnce(makeTokenDoc())
		ctx.runQuery.mockResolvedValueOnce(["track-1:2024-01-16T08:30:00Z"]) // existing

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(makeHevyApiWorkout()),
			}),
		)
		mockGetRecentlyPlayedTracks.mockResolvedValue(makeSpotifyResponse())

		await capturedHandler(ctx, {
			userId: FAKE_USER_ID,
			apiKey: "test-key",
			workoutId: "workout-abc",
		})

		expect(ctx.runMutation).not.toHaveBeenCalledWith(
			"internal:spotify:storeTracks",
			expect.anything(),
		)
	})

	it("skips music sync when Spotify credentials not set", async () => {
		delete process.env.AUTH_SPOTIFY_ID
		delete process.env.AUTH_SPOTIFY_SECRET

		const ctx = createMockCtx()
		ctx.runQuery.mockResolvedValueOnce([])
		ctx.runQuery.mockResolvedValueOnce(makeTokenDoc({ expiresAt: NOW - 1000 }))

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(makeHevyApiWorkout()),
			}),
		)

		await capturedHandler(ctx, {
			userId: FAKE_USER_ID,
			apiKey: "test-key",
			workoutId: "workout-abc",
		})

		expect(ctx.runMutation).not.toHaveBeenCalledWith(
			"internal:spotify:storeTracks",
			expect.anything(),
		)
	})
})
