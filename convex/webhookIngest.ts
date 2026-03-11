"use node"

import { v } from "convex/values"
import { internalAction } from "./_generated/server"
import { internal } from "./_generated/api"
import { mapWorkout, filterNewWorkouts } from "./hevy"
import {
	mapSpotifyItemToTrack,
	refreshSpotifyToken,
	filterNewSpotifyTracks,
} from "./spotify.helpers"
import { SpotifyApi } from "@spotify/web-api-ts-sdk"

export const ingestWorkout = internalAction({
	args: {
		userId: v.id("users"),
		workoutId: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, { userId, workoutId }) => {
		// 1. Look up the user's Hevy API key
		const hevyUser = await ctx.runQuery(internal.hevyUsers.getByUserId, { userId })
		if (!hevyUser) {
			console.error(`No Hevy user found for userId ${userId}`)
			return null
		}
		const apiKey = hevyUser.apiKey

		// 2. Fetch the specific workout from Hevy API
		const res = await fetch(
			`https://api.hevyapp.com/v1/workouts/${workoutId}`,
			{ headers: { "api-key": apiKey } },
		)

		if (!res.ok) {
			console.error(`Hevy API error fetching workout ${workoutId}: ${res.status}`)
			return null
		}

		const apiWorkout = await res.json()
		const mapped = mapWorkout(apiWorkout)

		// 2. Dedup and store workout
		const existingIds = await ctx.runQuery(
			internal.hevy.getExistingWorkoutIds,
			{ userId },
		)
		const newWorkouts = filterNewWorkouts([mapped], new Set(existingIds))
		if (newWorkouts.length > 0) {
			await ctx.runMutation(internal.hevy.storeWorkouts, {
				userId,
				workouts: newWorkouts,
			})
			console.log(`Webhook: stored workout ${workoutId}`)
		}

		// 3. Fetch Spotify recently played tracks
		const tokenDoc = await ctx.runQuery(internal.spotify.getTokens, { userId })
		if (!tokenDoc) {
			console.log("Webhook: no Spotify tokens, skipping music sync")
			return null
		}

		let { accessToken, refreshToken, expiresAt } = tokenDoc
		const tokenDocId = tokenDoc._id

		if (expiresAt < Date.now()) {
			const clientId = process.env.AUTH_SPOTIFY_ID
			const clientSecret = process.env.AUTH_SPOTIFY_SECRET
			if (!clientId || !clientSecret) {
				console.error("Webhook: Spotify credentials not set")
				return null
			}
			const refreshed = await refreshSpotifyToken(refreshToken, clientId, clientSecret)
			if (!refreshed) {
				console.error("Webhook: failed to refresh Spotify token")
				return null
			}
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

		const spotifyData = await sdk.player.getRecentlyPlayedTracks(50)
		const tracks = spotifyData.items.map(mapSpotifyItemToTrack)

		// 4. Dedup and store tracks
		const existingTrackKeys = await ctx.runQuery(
			internal.spotify.getExistingTrackKeys,
			{ userId },
		)
		const newTracks = filterNewSpotifyTracks(tracks, new Set(existingTrackKeys))

		if (newTracks.length > 0) {
			await ctx.runMutation(internal.spotify.storeTracks, {
				userId,
				tracks: newTracks,
			})
			console.log(`Webhook: stored ${newTracks.length} new Spotify tracks`)
		}

		return null
	},
})
