"use node"

import { v } from "convex/values"
import { internalAction } from "./_generated/server"
import { internal } from "./_generated/api"

export const seedFromEnv = internalAction({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		const apiKey = process.env.HEVY_API_KEY
		if (!apiKey) {
			console.error("HEVY_API_KEY not set, cannot seed hevyUsers")
			return null
		}

		// Find the first user (same logic as existing sync)
		const userId = await ctx.runQuery(internal.spotify.getFirstUserId)
		if (!userId) {
			console.error("No user found to seed hevyUsers")
			return null
		}

		// Fetch user info from Hevy API
		const res = await fetch("https://api.hevyapp.com/v1/user/info", {
			headers: { "api-key": apiKey },
		})

		if (!res.ok) {
			console.error(`Hevy user info API error: ${res.status}`)
			return null
		}

		const data = await res.json()
		const hevyId: string = data.data.id
		// Extract username from URL: "https://hevy.com/user/gmazerogers" -> "gmazerogers"
		const hevyUrl: string = data.data.url
		const hevyUsername = hevyUrl.split("/user/")[1]

		if (!hevyUsername) {
			console.error("Could not extract username from Hevy URL:", hevyUrl)
			return null
		}

		await ctx.runMutation(internal.hevyUsers.upsertHevyUser, {
			userId,
			hevyId,
			hevyUsername,
			apiKey,
			webhookSecret: crypto.randomUUID(),
		})

		console.log(`Seeded hevyUser: ${hevyUsername} (${hevyId})`)
		return null
	},
})
