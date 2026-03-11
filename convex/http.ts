import { httpRouter } from "convex/server"
import { auth } from "./auth"
import { handleHevyWebhook } from "./webhook"

const http = httpRouter()

auth.addHttpRoutes(http)

http.route({
	pathPrefix: "/ingest/hevy/workout/",
	method: "POST",
	handler: handleHevyWebhook,
})

export default http
