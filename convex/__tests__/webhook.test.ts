import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock Convex generated modules
vi.mock("../_generated/api", () => ({
	internal: {
		hevyUsers: {
			getByHevyId: "internal:hevyUsers:getByHevyId",
		},
		webhookIngest: {
			ingestWorkout: "internal:webhookIngest:ingestWorkout",
		},
	},
}))

let capturedHandler: (ctx: unknown, request: Request) => Promise<Response>

vi.mock("../_generated/server", () => ({
	httpAction: (handler: (ctx: unknown, request: Request) => Promise<Response>) => {
		capturedHandler = handler
		return handler
	},
}))

// Import after mocks
await import("../webhook")

const FAKE_USER_ID = "user123" as any

function createMockCtx() {
	return {
		runQuery: vi.fn(),
		scheduler: {
			runAfter: vi.fn(),
		},
	}
}

function makeHevyUser(overrides = {}) {
	return {
		userId: FAKE_USER_ID,
		hevyId: "hevy-123",
		hevyUsername: "testuser",
		apiKey: "test-api-key",
		webhookSecret: "test-secret-uuid",
		...overrides,
	}
}

function makeRequest(
	hevyId: string,
	body: unknown,
	token?: string,
): Request {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	}
	if (token) {
		headers["Authorization"] = `Bearer ${token}`
	}
	return new Request(
		`https://example.convex.site/ingest/hevy/workout/${hevyId}`,
		{
			method: "POST",
			headers,
			body: JSON.stringify(body),
		},
	)
}

describe("handleHevyWebhook", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("returns 404 when user not found", async () => {
		const ctx = createMockCtx()
		ctx.runQuery.mockResolvedValueOnce(null)

		const res = await capturedHandler(
			ctx,
			makeRequest("unknown-id", { workoutId: "w1" }, "some-token"),
		)

		expect(res.status).toBe(404)
		expect(await res.text()).toBe("Unknown user")
	})

	it("returns 401 when no Authorization header", async () => {
		const ctx = createMockCtx()
		ctx.runQuery.mockResolvedValueOnce(makeHevyUser())

		const req = new Request(
			"https://example.convex.site/ingest/hevy/workout/hevy-123",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ workoutId: "w1" }),
			},
		)

		const res = await capturedHandler(ctx, req)

		expect(res.status).toBe(401)
		expect(await res.text()).toBe("Unauthorized")
	})

	it("returns 401 when token is wrong", async () => {
		const ctx = createMockCtx()
		ctx.runQuery.mockResolvedValueOnce(makeHevyUser())

		const res = await capturedHandler(
			ctx,
			makeRequest("hevy-123", { workoutId: "w1" }, "wrong-token"),
		)

		expect(res.status).toBe(401)
		expect(await res.text()).toBe("Unauthorized")
	})

	it("returns 400 when workoutId is missing", async () => {
		const ctx = createMockCtx()
		ctx.runQuery.mockResolvedValueOnce(makeHevyUser())

		const res = await capturedHandler(
			ctx,
			makeRequest("hevy-123", {}, "test-secret-uuid"),
		)

		expect(res.status).toBe(400)
		expect(await res.text()).toBe("Missing workoutId")
	})

	it("returns 400 when workoutId is not a string", async () => {
		const ctx = createMockCtx()
		ctx.runQuery.mockResolvedValueOnce(makeHevyUser())

		const res = await capturedHandler(
			ctx,
			makeRequest("hevy-123", { workoutId: 123 }, "test-secret-uuid"),
		)

		expect(res.status).toBe(400)
		expect(await res.text()).toBe("Missing workoutId")
	})

	it("returns 200 and schedules ingest on valid request", async () => {
		const ctx = createMockCtx()
		const hevyUser = makeHevyUser()
		ctx.runQuery.mockResolvedValueOnce(hevyUser)

		const res = await capturedHandler(
			ctx,
			makeRequest("hevy-123", { workoutId: "workout-abc" }, "test-secret-uuid"),
		)

		expect(res.status).toBe(200)
		expect(await res.text()).toBe("OK")
		expect(ctx.scheduler.runAfter).toHaveBeenCalledWith(
			0,
			"internal:webhookIngest:ingestWorkout",
			{
				userId: FAKE_USER_ID,
				apiKey: "test-api-key",
				workoutId: "workout-abc",
			},
		)
	})

	it("looks up user by hevyId from URL path", async () => {
		const ctx = createMockCtx()
		ctx.runQuery.mockResolvedValueOnce(null)

		await capturedHandler(
			ctx,
			makeRequest("my-hevy-id", { workoutId: "w1" }, "token"),
		)

		expect(ctx.runQuery).toHaveBeenCalledWith(
			"internal:hevyUsers:getByHevyId",
			{ hevyId: "my-hevy-id" },
		)
	})
})
