import { query } from "./_generated/server"
import { getAuthUserId } from "@convex-dev/auth/server"

export const getWorkoutsWithMusic = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx)
		if (!userId) throw new Error("Not authenticated")

		const hevyUser = await ctx.db
			.query("hevyUsers")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.unique()

		const workouts = await ctx.db
			.query("workouts")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.collect()

		const musicHistory = await ctx.db
			.query("musicHistory")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.collect()

		return {
			userId,
			hevyUsername: hevyUser?.hevyUsername ?? null,
			workouts,
			musicHistory,
		}
	},
})
