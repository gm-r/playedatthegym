import { v } from "convex/values"
import {
	action,
	internalMutation,
	internalQuery,
} from "./_generated/server"
import { internal } from "./_generated/api"
import { getAuthUserId } from "@convex-dev/auth/server"
import { SpotifyApi } from "@spotify/web-api-ts-sdk"
import {
	type Track,
	mapSpotifyItemToTrack,
	refreshSpotifyToken,
} from "./spotify.helpers"
import type { ActionCtx } from "./_generated/server"

export const getFirstUserId = internalQuery({
	args: {},
	returns: v.union(v.id("users"), v.null()),
	handler: async (ctx) => {
		const token = await ctx.db.query("spotifyTokens").first()
		return token?.userId ?? null
	},
})

export const getExistingTrackKeys = internalQuery({
	args: { userId: v.id("users") },
	returns: v.array(v.string()),
	handler: async (ctx, args) => {
		const tracks = await ctx.db
			.query("musicHistory")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.collect()
		return tracks.map((t) => `${t.spotifyTrackId}:${t.playedAt}`)
	},
})

export const getTokens = internalQuery({
	args: { userId: v.id("users") },
	returns: v.union(
		v.object({
			_id: v.id("spotifyTokens"),
			_creationTime: v.number(),
			userId: v.id("users"),
			accessToken: v.string(),
			refreshToken: v.string(),
			expiresAt: v.number(),
			spotifyUserId: v.string(),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		return await ctx.db
			.query("spotifyTokens")
			.withIndex("by_userId", (q) => q.eq("userId", args.userId))
			.unique()
	},
})

export const updateTokens = internalMutation({
	args: {
		tokenDocId: v.id("spotifyTokens"),
		accessToken: v.string(),
		expiresAt: v.number(),
		refreshToken: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const patch: Record<string, unknown> = {
			accessToken: args.accessToken,
			expiresAt: args.expiresAt,
		}
		if (args.refreshToken) {
			patch.refreshToken = args.refreshToken
		}
		await ctx.db.patch(args.tokenDocId, patch)
	},
})

export const storeTracks = internalMutation({
	args: {
		userId: v.id("users"),
		tracks: v.array(
			v.object({
				spotifyTrackId: v.string(),
				trackName: v.string(),
				artistName: v.string(),
				albumName: v.string(),
				albumImageUrl: v.optional(v.string()),
				playedAt: v.string(),
				durationMs: v.optional(v.number()),
				trackUrl: v.optional(v.string()),
			}),
		),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		for (const track of args.tracks) {
			await ctx.db.insert("musicHistory", {
				userId: args.userId,
				...track,
			})
		}
	},
})

export async function getRecentlyPlayedHandler(
	ctx: ActionCtx,
): Promise<Track[]> {
	const userId = await getAuthUserId(ctx)
	if (!userId) throw new Error("Not authenticated")

	const tokenDoc = await ctx.runQuery(internal.spotify.getTokens, { userId })
	if (!tokenDoc) throw new Error("No Spotify tokens found")

	let { accessToken, refreshToken, expiresAt, _id: tokenDocId } = tokenDoc

	if (expiresAt < Date.now()) {
		const clientId = process.env.AUTH_SPOTIFY_ID!
		const clientSecret = process.env.AUTH_SPOTIFY_SECRET!
		const refreshed = await refreshSpotifyToken(
			refreshToken,
			clientId,
			clientSecret,
		)
		if (!refreshed) throw new Error("Failed to refresh Spotify token")
		accessToken = refreshed.access_token
		await ctx.runMutation(internal.spotify.updateTokens, {
			tokenDocId,
			accessToken: refreshed.access_token,
			expiresAt: Date.now() + refreshed.expires_in * 1000,
			refreshToken: refreshed.refresh_token,
		})
	}

	const sdk = SpotifyApi.withAccessToken(process.env.AUTH_SPOTIFY_ID!, {
		access_token: accessToken,
		token_type: "Bearer",
		expires_in: 3600,
		refresh_token: "",
	})

	const data = await sdk.player.getRecentlyPlayedTracks(50)
	const tracks: Track[] = data.items.map(mapSpotifyItemToTrack)

	await ctx.runMutation(internal.spotify.storeTracks, { userId, tracks })

	return tracks
}

export const getRecentlyPlayed = action({
	args: {},
	handler: getRecentlyPlayedHandler,
})
