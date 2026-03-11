import { query } from "./_generated/server"
import { v } from "convex/values"

export const getWorkoutWithMusic = query({
	args: {
		hevyUsername: v.string(),
		hevyWorkoutId: v.string(),
	},
	handler: async (ctx, { hevyUsername, hevyWorkoutId }) => {
		// Look up the hevy user by username
		const hevyUser = await ctx.db
			.query("hevyUsers")
			.withIndex("by_hevyUsername", (q) => q.eq("hevyUsername", hevyUsername))
			.unique()

		if (!hevyUser) return null

		const workout = await ctx.db
			.query("workouts")
			.withIndex("by_userId_hevyWorkoutId", (q) =>
				q.eq("userId", hevyUser.userId).eq("hevyWorkoutId", hevyWorkoutId),
			)
			.unique()

		if (!workout) return null

		const musicHistory = await ctx.db
			.query("musicHistory")
			.withIndex("by_userId", (q) => q.eq("userId", hevyUser.userId))
			.collect()

		return { workout, musicHistory }
	},
})
