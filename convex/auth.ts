import Spotify from "@auth/core/providers/spotify"
import { convexAuth } from "@convex-dev/auth/server"

export const { auth, signIn, signOut, store } = convexAuth({
	providers: [
		Spotify({
			authorization:
				"https://accounts.spotify.com/authorize?scope=user-read-email+user-read-recently-played",
			profile(profile, tokens) {
				return {
					id: profile.id,
					name: profile.display_name,
					email: profile.email,
					image: profile.images?.[0]?.url,
					// Pass tokens through the profile so we can capture them
					// in createOrUpdateUser
					spotifyAccessToken: tokens.access_token,
					spotifyRefreshToken: tokens.refresh_token,
					spotifyTokenExpiresAt: tokens.expires_at,
				}
			},
		}),
	],
	callbacks: {
		async createOrUpdateUser(ctx, { existingUserId, profile }) {
			// Separate Spotify tokens from user profile data
			const {
				spotifyAccessToken,
				spotifyRefreshToken,
				spotifyTokenExpiresAt,
				emailVerified: _emailVerified,
				phoneVerified: _phoneVerified,
				...userProfile
			} = profile as Record<string, any>

			// Create or update the user with clean profile data
			let userId = existingUserId
			if (userId) {
				await ctx.db.patch(userId, userProfile)
			} else {
				userId = await ctx.db.insert("users" as any, {
					...userProfile,
					emailVerificationTime: Date.now(),
				})
			}

			// Store Spotify tokens for API access
			if (spotifyAccessToken) {
				// Use `as any` because the callback ctx types don't include our custom tables
				const db = ctx.db as any
				const existing = await db
					.query("spotifyTokens")
					.withIndex("by_userId", (q: any) => q.eq("userId", userId))
					.unique()

				const tokenData = {
					accessToken: spotifyAccessToken as string,
					refreshToken: (spotifyRefreshToken as string) ?? "",
					expiresAt: spotifyTokenExpiresAt
						? (spotifyTokenExpiresAt as number) * 1000
						: Date.now() + 3600 * 1000,
					spotifyUserId: (profile as Record<string, any>).id ?? "",
				}

				if (existing) {
					await db.patch(existing._id, tokenData)
				} else {
					await db.insert("spotifyTokens", {
						userId: userId!,
						...tokenData,
					})
				}
			}

			return userId!
		},
	},
})
