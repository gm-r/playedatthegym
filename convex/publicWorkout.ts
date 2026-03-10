import { query } from "./_generated/server"
import { v } from "convex/values"

export const getWorkoutWithMusic = query({
	args: {
		userId: v.id("users"),
		hevyWorkoutId: v.string(),
	},
	handler: async (ctx, { userId, hevyWorkoutId }) => {
		const workout = await ctx.db
			.query("workouts")
			.withIndex("by_userId_hevyWorkoutId", (q) =>
				q.eq("userId", userId).eq("hevyWorkoutId", hevyWorkoutId),
			)
			.unique()

		if (!workout) return null

		const musicHistory = await ctx.db
			.query("musicHistory")
			.withIndex("by_userId", (q) => q.eq("userId", userId))
			.collect()

		return { workout, musicHistory }
	},
})
