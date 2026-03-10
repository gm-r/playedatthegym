import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock Convex generated modules
vi.mock("../_generated/api", () => ({
	internal: {
		spotify: {
			getFirstUserId: "internal:spotify:getFirstUserId",
			getTokens: "internal:spotify:getTokens",
			updateTokens: "internal:spotify:updateTokens",
			storeTracks: "internal:spotify:storeTracks",
			getExistingTrackKeys: "internal:spotify:getExistingTrackKeys",
		},
		hevy: {
			getMostRecentWorkoutStartTime:
				"internal:hevy:getMostRecentWorkoutStartTime",
			getExistingWorkoutIds: "internal:hevy:getExistingWorkoutIds",
			storeWorkouts: "internal:hevy:storeWorkouts",
		},
		sync: {
			syncWorkoutsAndMusic: "internal:sync:syncWorkoutsAndMusic",
		},
	},
}))

let capturedHandler: (ctx: unknown) => Promise<null>

vi.mock("../_generated/server", () => ({
	internalAction: (config: { handler: (ctx: unknown) => Promise<null> }) => {
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
	const actual =
		await importOriginal<typeof import("../spotify.helpers")>()
	return {
		...actual,
		refreshSpotifyToken: (...args: unknown[]) =>
			mockRefreshSpotifyToken(...args),
	}
})

// Import after mocks
await import("../sync")

const FAKE_USER_ID = "user123" as any
const FAKE_TOKEN_DOC_ID = "tokenDoc456" as any
const NOW = 1700000000000

function createMockCtx() {
	return {
		runQuery: vi.fn(),
		runMutation: vi.fn(),
		runAction: vi.fn(),
	}
}

function makeHevyApiResponse(overrides = {}) {
	return {
		workouts: [
			{
				id: "workout-new",
				title: "New Workout",
				routine_id: null,
				description: null,
				start_time: "2024-01-16T08:00:00Z",
				end_time: "2024-01-16T09:00:00Z",
				updated_at: "2024-01-16T09:00:00Z",
				created_at: "2024-01-16T08:00:00Z",
				exercises: [],
				...overrides,
			},
		],
		page: 1,
		page_count: 1,
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

describe("syncWorkoutsAndMusic", () => {
	let originalEnv: NodeJS.ProcessEnv

	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(NOW)
		vi.clearAllMocks()
		originalEnv = { ...process.env }
		process.env.HEVY_API_KEY = "test-hevy-key"
		process.env.AUTH_SPOTIFY_ID = "test-client-id"
		process.env.AUTH_SPOTIFY_SECRET = "test-client-secret"
	})

	afterEach(() => {
		process.env = originalEnv
		vi.useRealTimers()
	})

	it("returns early when no user found", async () => {
		const ctx = createMockCtx()
		ctx.runQuery.mockResolvedValueOnce(null) // getFirstUserId

		const result = await capturedHandler(ctx)

		expect(result).toBeNull()
		expect(ctx.runQuery).toHaveBeenCalledTimes(1)
		expect(ctx.runQuery).toHaveBeenCalledWith(
			"internal:spotify:getFirstUserId",
		)
		expect(ctx.runMutation).not.toHaveBeenCalled()
	})

	it("returns early when HEVY_API_KEY is not set", async () => {
		delete process.env.HEVY_API_KEY
		const ctx = createMockCtx()
		ctx.runQuery.mockResolvedValueOnce(FAKE_USER_ID) // getFirstUserId
		ctx.runQuery.mockResolvedValueOnce(null) // getMostRecentWorkoutStartTime

		const result = await capturedHandler(ctx)

		expect(result).toBeNull()
		expect(ctx.runMutation).not.toHaveBeenCalled()
	})

	it("returns early when Hevy API returns error", async () => {
		const ctx = createMockCtx()
		ctx.runQuery.mockResolvedValueOnce(FAKE_USER_ID)
		ctx.runQuery.mockResolvedValueOnce(null)

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({ ok: false, status: 500 }),
		)

		const result = await capturedHandler(ctx)

		expect(result).toBeNull()
		expect(ctx.runMutation).not.toHaveBeenCalled()
	})

	it("returns early when Hevy API returns empty workouts", async () => {
		const ctx = createMockCtx()
		ctx.runQuery.mockResolvedValueOnce(FAKE_USER_ID)
		ctx.runQuery.mockResolvedValueOnce(null)

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ workouts: [] }),
			}),
		)

		const result = await capturedHandler(ctx)

		expect(result).toBeNull()
		expect(ctx.runMutation).not.toHaveBeenCalled()
	})

	it("returns early when workout is not newer than stored", async () => {
		const ctx = createMockCtx()
		ctx.runQuery.mockResolvedValueOnce(FAKE_USER_ID)
		ctx.runQuery.mockResolvedValueOnce("2024-01-17T08:00:00Z") // stored is newer

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(makeHevyApiResponse()),
			}),
		)

		const result = await capturedHandler(ctx)

		expect(result).toBeNull()
		expect(ctx.runMutation).not.toHaveBeenCalled()
	})

	it("stores new workout and fetches Spotify tracks when workout is newer", async () => {
		const ctx = createMockCtx()
		ctx.runQuery.mockResolvedValueOnce(FAKE_USER_ID) // getFirstUserId
		ctx.runQuery.mockResolvedValueOnce("2024-01-15T08:00:00Z") // getMostRecentWorkoutStartTime (older)
		ctx.runQuery.mockResolvedValueOnce([]) // getExistingWorkoutIds
		ctx.runQuery.mockResolvedValueOnce(makeTokenDoc()) // getTokens
		ctx.runQuery.mockResolvedValueOnce([]) // getExistingTrackKeys

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(makeHevyApiResponse()),
			}),
		)
		mockGetRecentlyPlayedTracks.mockResolvedValue(makeSpotifyResponse())

		const result = await capturedHandler(ctx)

		expect(result).toBeNull()
		// Stored workout
		expect(ctx.runMutation).toHaveBeenCalledWith(
			"internal:hevy:storeWorkouts",
			expect.objectContaining({
				userId: FAKE_USER_ID,
				workouts: expect.arrayContaining([
					expect.objectContaining({ hevyWorkoutId: "workout-new" }),
				]),
			}),
		)
		// Stored tracks
		expect(ctx.runMutation).toHaveBeenCalledWith(
			"internal:spotify:storeTracks",
			expect.objectContaining({
				userId: FAKE_USER_ID,
				tracks: expect.arrayContaining([
					expect.objectContaining({ spotifyTrackId: "track-1" }),
				]),
			}),
		)
	})

	it("stores workout when no existing workouts (first ever)", async () => {
		const ctx = createMockCtx()
		ctx.runQuery.mockResolvedValueOnce(FAKE_USER_ID)
		ctx.runQuery.mockResolvedValueOnce(null) // no stored workouts
		ctx.runQuery.mockResolvedValueOnce([]) // getExistingWorkoutIds
		ctx.runQuery.mockResolvedValueOnce(makeTokenDoc())
		ctx.runQuery.mockResolvedValueOnce([]) // getExistingTrackKeys

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(makeHevyApiResponse()),
			}),
		)
		mockGetRecentlyPlayedTracks.mockResolvedValue(makeSpotifyResponse())

		await capturedHandler(ctx)

		expect(ctx.runMutation).toHaveBeenCalledWith(
			"internal:hevy:storeWorkouts",
			expect.objectContaining({ userId: FAKE_USER_ID }),
		)
		expect(ctx.runMutation).toHaveBeenCalledWith(
			"internal:spotify:storeTracks",
			expect.objectContaining({ userId: FAKE_USER_ID }),
		)
	})

	it("skips music sync when no Spotify tokens found", async () => {
		const ctx = createMockCtx()
		ctx.runQuery.mockResolvedValueOnce(FAKE_USER_ID)
		ctx.runQuery.mockResolvedValueOnce(null) // no stored workouts
		ctx.runQuery.mockResolvedValueOnce([]) // getExistingWorkoutIds
		ctx.runQuery.mockResolvedValueOnce(null) // no Spotify tokens

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(makeHevyApiResponse()),
			}),
		)

		await capturedHandler(ctx)

		// Stored workout
		expect(ctx.runMutation).toHaveBeenCalledWith(
			"internal:hevy:storeWorkouts",
			expect.objectContaining({ userId: FAKE_USER_ID }),
		)
		// Did NOT store tracks
		expect(ctx.runMutation).not.toHaveBeenCalledWith(
			"internal:spotify:storeTracks",
			expect.anything(),
		)
	})

	it("refreshes Spotify token when expired", async () => {
		const ctx = createMockCtx()
		ctx.runQuery.mockResolvedValueOnce(FAKE_USER_ID)
		ctx.runQuery.mockResolvedValueOnce(null)
		ctx.runQuery.mockResolvedValueOnce([])
		ctx.runQuery.mockResolvedValueOnce(
			makeTokenDoc({ expiresAt: NOW - 1000 }),
		) // expired
		ctx.runQuery.mockResolvedValueOnce([])

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(makeHevyApiResponse()),
			}),
		)
		mockRefreshSpotifyToken.mockResolvedValue({
			access_token: "new-access-token",
			refresh_token: "new-refresh-token",
			expires_in: 3600,
		})
		mockGetRecentlyPlayedTracks.mockResolvedValue(makeSpotifyResponse())

		await capturedHandler(ctx)

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
				refreshToken: "new-refresh-token",
			}),
		)
		expect(mockWithAccessToken).toHaveBeenCalledWith(
			"test-client-id",
			expect.objectContaining({ access_token: "new-access-token" }),
		)
	})

	it("skips music sync when Spotify token refresh fails", async () => {
		const ctx = createMockCtx()
		ctx.runQuery.mockResolvedValueOnce(FAKE_USER_ID)
		ctx.runQuery.mockResolvedValueOnce(null)
		ctx.runQuery.mockResolvedValueOnce([])
		ctx.runQuery.mockResolvedValueOnce(
			makeTokenDoc({ expiresAt: NOW - 1000 }),
		)

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(makeHevyApiResponse()),
			}),
		)
		mockRefreshSpotifyToken.mockResolvedValue(null)

		await capturedHandler(ctx)

		// Stored workout
		expect(ctx.runMutation).toHaveBeenCalledWith(
			"internal:hevy:storeWorkouts",
			expect.objectContaining({ userId: FAKE_USER_ID }),
		)
		// Did NOT store tracks
		expect(ctx.runMutation).not.toHaveBeenCalledWith(
			"internal:spotify:storeTracks",
			expect.anything(),
		)
	})

	it("deduplicates Spotify tracks correctly", async () => {
		const ctx = createMockCtx()
		ctx.runQuery.mockResolvedValueOnce(FAKE_USER_ID)
		ctx.runQuery.mockResolvedValueOnce(null)
		ctx.runQuery.mockResolvedValueOnce([])
		ctx.runQuery.mockResolvedValueOnce(makeTokenDoc())
		ctx.runQuery.mockResolvedValueOnce([
			"track-1:2024-01-16T08:30:00Z",
		]) // existing track key

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve(makeHevyApiResponse()),
			}),
		)
		mockGetRecentlyPlayedTracks.mockResolvedValue(makeSpotifyResponse())

		await capturedHandler(ctx)

		// Stored workout
		expect(ctx.runMutation).toHaveBeenCalledWith(
			"internal:hevy:storeWorkouts",
			expect.objectContaining({ userId: FAKE_USER_ID }),
		)
		// Did NOT store tracks (all were duplicates)
		expect(ctx.runMutation).not.toHaveBeenCalledWith(
			"internal:spotify:storeTracks",
			expect.anything(),
		)
	})
})
