import { v } from "convex/values"
import {
	action,
	internalMutation,
	internalQuery,
	query,
} from "./_generated/server"
import { internal } from "./_generated/api"
import { getAuthUserId } from "@convex-dev/auth/server"

// --- Queries ---

export const getByUsername = query({
	args: { hevyUsername: v.string() },
	handler: async (ctx, { hevyUsername }) => {
		return await ctx.db
			.query("hevyUsers")
			.withIndex("by_hevyUsername", (q) => q.eq("hevyUsername", hevyUsername))
			.unique()
	},
})

export const getByUserId = internalQuery({
	args: { userId: v.id("users") },
	handler: async (ctx, { userId }) => {
		return await ctx.db
			.query("hevyUsers")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.unique()
	},
})

export const getByHevyId = internalQuery({
	args: { hevyId: v.string() },
	handler: async (ctx, { hevyId }) => {
		return await ctx.db
			.query("hevyUsers")
			.withIndex("by_hevyId", (q) => q.eq("hevyId", hevyId))
			.unique()
	},
})

export const getAllHevyUsers = internalQuery({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("hevyUsers").collect()
	},
})

export const getIntegrationStatus = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx)
		if (!userId) return { connected: false as const }

		const hevyUser = await ctx.db
			.query("hevyUsers")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.unique()

		if (!hevyUser) return { connected: false as const }

		return {
			connected: true as const,
			hevyUsername: hevyUser.hevyUsername,
			hevyId: hevyUser.hevyId,
			webhookSecret: hevyUser.webhookSecret,
		}
	},
})

// --- Mutations ---

export const upsertHevyUser = internalMutation({
	args: {
		userId: v.id("users"),
		hevyId: v.string(),
		hevyUsername: v.string(),
		apiKey: v.string(),
		webhookSecret: v.string(),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("hevyUsers")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.unique()

		if (existing) {
			await ctx.db.patch(existing._id, {
				hevyId: args.hevyId,
				hevyUsername: args.hevyUsername,
				apiKey: args.apiKey,
				webhookSecret: args.webhookSecret,
			})
			return existing._id
		}

		return await ctx.db.insert("hevyUsers", args)
	},
})

// --- Actions ---

export const setupHevyIntegration = action({
	args: { apiKey: v.string() },
	returns: v.object({
		hevyId: v.string(),
		webhookSecret: v.string(),
		hevyUsername: v.string(),
	}),
	handler: async (ctx, { apiKey }) => {
		const userId = await getAuthUserId(ctx)
		if (!userId) throw new Error("Not authenticated")

		// Validate API key by calling Hevy user info endpoint
		const res = await fetch("https://api.hevyapp.com/v1/user/info", {
			headers: { "api-key": apiKey },
		})

		if (!res.ok) {
			throw new Error("Invalid Hevy API key")
		}

		const data = await res.json()
		const hevyId: string = data.data.id
		const hevyUrl: string = data.data.url
		const hevyUsername = hevyUrl.split("/user/")[1]

		if (!hevyUsername) {
			throw new Error("Could not extract username from Hevy profile")
		}

		const webhookSecret = crypto.randomUUID()

		await ctx.runMutation(internal.hevyUsers.upsertHevyUser, {
			userId,
			hevyId,
			hevyUsername,
			apiKey,
			webhookSecret,
		})

		return { hevyId, webhookSecret, hevyUsername }
	},
})
