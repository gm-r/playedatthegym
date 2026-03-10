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

export const syncWorkoutsAndMusic = internalAction({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		// 1. Resolve user
		const userId = await ctx.runQuery(internal.spotify.getFirstUserId)
		if (!userId) {
			console.log("No user found, skipping sync")
			return null
		}

		// 2. Get most recent stored workout startTime
		const latestStartTime = await ctx.runQuery(
			internal.hevy.getMostRecentWorkoutStartTime,
			{ userId },
		)

		// 3. Fetch most recent workout from Hevy API
		const apiKey = process.env.HEVY_API_KEY
		if (!apiKey) {
			console.error("HEVY_API_KEY not set")
			return null
		}

		let res: Response
		try {
			res = await fetch(
				"https://api.hevyapp.com/v1/workouts?page=1&pageSize=1",
				{ headers: { "api-key": apiKey } },
			)
		} catch (err) {
			console.error("Hevy API fetch failed:", err)
			return null
		}

		if (!res.ok) {
			console.error(`Hevy API error: ${res.status}`)
			return null
		}

		const data = await res.json()
		if (!data.workouts || data.workouts.length === 0) {
			console.log("No workouts from Hevy API")
			return null
		}

		const apiWorkout = data.workouts[0]
		const mapped = mapWorkout(apiWorkout)

		// 4. Compare startTime
		if (
			latestStartTime &&
			new Date(mapped.startTime) <= new Date(latestStartTime)
		) {
			return null
		}

		// 5. Dedup and store workout
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
			console.log(`Stored new workout: ${mapped.title}`)
		}

		// 6. Fetch Spotify tracks
		const tokenDoc = await ctx.runQuery(internal.spotify.getTokens, {
			userId,
		})
		if (!tokenDoc) {
			console.log("No Spotify tokens, skipping music sync")
			return null
		}

		let { accessToken, refreshToken, expiresAt } = tokenDoc
		const tokenDocId = tokenDoc._id

		if (expiresAt < Date.now()) {
			const clientId = process.env.AUTH_SPOTIFY_ID
			const clientSecret = process.env.AUTH_SPOTIFY_SECRET
			if (!clientId || !clientSecret) {
				console.error("Spotify credentials not set")
				return null
			}
			const refreshed = await refreshSpotifyToken(
				refreshToken,
				clientId,
				clientSecret,
			)
			if (!refreshed) {
				console.error("Failed to refresh Spotify token")
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

		// 7. Dedup and store tracks
		const existingTrackKeys = await ctx.runQuery(
			internal.spotify.getExistingTrackKeys,
			{ userId },
		)
		const newTracks = filterNewSpotifyTracks(
			tracks,
			new Set(existingTrackKeys),
		)

		if (newTracks.length > 0) {
			await ctx.runMutation(internal.spotify.storeTracks, {
				userId,
				tracks: newTracks,
			})
			console.log(`Stored ${newTracks.length} new Spotify tracks`)
		}

		return null
	},
})
