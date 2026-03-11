import { httpAction } from "./_generated/server"
import { internal } from "./_generated/api"

export const handleHevyWebhook = httpAction(async (ctx, request) => {
	// Parse hevyId from URL path: /ingest/hevy/workout/{hevyId}
	const url = new URL(request.url)
	const pathParts = url.pathname.split("/")
	const hevyId = pathParts[pathParts.length - 1]

	if (!hevyId) {
		return new Response("Missing hevyId", { status: 404 })
	}

	// Look up user
	const hevyUser = await ctx.runQuery(internal.hevyUsers.getByHevyId, { hevyId })
	if (!hevyUser) {
		return new Response("Unknown user", { status: 404 })
	}

	// Validate bearer token
	const authHeader = request.headers.get("Authorization")
	const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null
	if (!token || token !== hevyUser.webhookSecret) {
		return new Response("Unauthorized", { status: 401 })
	}

	// Parse body
	const body = await request.json()
	const workoutId = body.workoutId
	if (!workoutId || typeof workoutId !== "string") {
		return new Response("Missing workoutId", { status: 400 })
	}

	// Schedule the ingest action and return immediately
	await ctx.scheduler.runAfter(0, internal.webhookIngest.ingestWorkout, {
		userId: hevyUser.userId,
		workoutId,
	})

	return new Response("OK", { status: 200 })
})
