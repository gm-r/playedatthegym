import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useConvexAuth, useQuery } from "convex/react"
import { useAction } from "convex/react"
import { useAuthActions } from "@convex-dev/auth/react"
import { api } from "../../../convex/_generated/api"
import { useEffect, useMemo, useRef, useState } from "react"
import { buildWorkoutCards } from "../../../convex/matching"
import { WorkoutCard } from "../../components/workout"

export const Route = createFileRoute("/_app/dashboard")({
	component: DashboardPage,
})

function DashboardPage() {
	const { isAuthenticated, isLoading } = useConvexAuth()
	const { signOut } = useAuthActions()
	const navigate = useNavigate()
	const getRecentlyPlayed = useAction(api.spotify.getRecentlyPlayed)
	const fetchWorkouts = useAction(api.hevy.fetchWorkouts)
	const data = useQuery(
		api.dashboard.getWorkoutsWithMusic,
		isAuthenticated ? {} : "skip",
	)

	const [fetchingMusic, setFetchingMusic] = useState(false)
	const [musicError, setMusicError] = useState<string | null>(null)
	const [fetchingWorkouts, setFetchingWorkouts] = useState(false)
	const [workoutResult, setWorkoutResult] = useState<string | null>(null)
	const [workoutError, setWorkoutError] = useState<string | null>(null)
	const hasFetched = useRef(false)

	useEffect(() => {
		if (!isLoading && !isAuthenticated) {
			navigate({ to: "/login" })
		}
	}, [isLoading, isAuthenticated, navigate])

	// Auto-fetch music from Spotify API on first load (stores to DB, useQuery picks it up)
	useEffect(() => {
		if (isAuthenticated && !hasFetched.current) {
			hasFetched.current = true
			setFetchingMusic(true)
			getRecentlyPlayed({})
				.catch((err) => {
					setMusicError(err.message ?? "Failed to fetch listening history")
				})
				.finally(() => {
					setFetchingMusic(false)
				})
		}
	}, [isAuthenticated, getRecentlyPlayed])

	const workoutCards = useMemo(() => {
		if (!data) return []
		return buildWorkoutCards(data.workouts, data.musicHistory)
	}, [data])

	if (isLoading) {
		return (
			<main className="page-wrap px-4 pb-8 pt-14">
				<p className="text-[var(--sea-ink-soft)]">Loading...</p>
			</main>
		)
	}

	if (!isAuthenticated) {
		return null
	}

	const handleSignOut = () => {
		void signOut().then(() => navigate({ to: "/login" }))
	}

	const handleFetchWorkouts = () => {
		setFetchingWorkouts(true)
		setWorkoutResult(null)
		setWorkoutError(null)
		fetchWorkouts({})
			.then((result) => {
				setWorkoutResult(
					`Added ${result.added} new workout${result.added !== 1 ? "s" : ""} (${result.total} total from Hevy)`,
				)
			})
			.catch((err) => {
				setWorkoutError(err.message ?? "Failed to fetch workouts")
			})
			.finally(() => {
				setFetchingWorkouts(false)
			})
	}

	const handleFetchMusic = () => {
		setFetchingMusic(true)
		setMusicError(null)
		getRecentlyPlayed({})
			.catch((err) => {
				setMusicError(err.message ?? "Failed to fetch listening history")
			})
			.finally(() => {
				setFetchingMusic(false)
			})
	}

	return (
		<main className="page-wrap px-4 pb-8 pt-14">
			<section className="island-shell rise-in rounded-[2rem] px-6 py-10 sm:px-10 sm:py-14">
				<div className="mb-6 flex items-center justify-between">
					<h1 className="display-title text-4xl font-bold tracking-tight text-[var(--sea-ink)]">
						Workout Music
					</h1>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => navigate({ to: "/settings" })}
							className="rounded-full border border-[rgba(23,58,64,0.2)] bg-white/50 px-4 py-2 text-sm font-semibold text-[var(--sea-ink)] transition hover:-translate-y-0.5 hover:border-[rgba(23,58,64,0.35)]"
						>
							Settings
						</button>
						<button
							type="button"
							onClick={handleSignOut}
							className="rounded-full border border-[rgba(23,58,64,0.2)] bg-white/50 px-4 py-2 text-sm font-semibold text-[var(--sea-ink)] transition hover:-translate-y-0.5 hover:border-[rgba(23,58,64,0.35)]"
						>
							Sign Out
						</button>
					</div>
				</div>

				<div className="mb-8 flex flex-wrap items-center gap-3">
					<button
						type="button"
						onClick={handleFetchWorkouts}
						disabled={fetchingWorkouts}
						className="rounded-full border border-[rgba(23,58,64,0.2)] bg-white/50 px-4 py-2 text-sm font-semibold text-[var(--sea-ink)] transition hover:-translate-y-0.5 hover:border-[rgba(23,58,64,0.35)] disabled:opacity-50"
					>
						{fetchingWorkouts ? "Fetching Workouts..." : "Fetch Workouts"}
					</button>
					<button
						type="button"
						onClick={handleFetchMusic}
						disabled={fetchingMusic}
						className="rounded-full border border-[rgba(23,58,64,0.2)] bg-white/50 px-4 py-2 text-sm font-semibold text-[var(--sea-ink)] transition hover:-translate-y-0.5 hover:border-[rgba(23,58,64,0.35)] disabled:opacity-50"
					>
						{fetchingMusic ? "Fetching Music..." : "Fetch Music"}
					</button>
					{workoutResult && (
						<span className="text-sm text-green-700">{workoutResult}</span>
					)}
					{workoutError && (
						<span className="text-sm text-red-600">{workoutError}</span>
					)}
					{musicError && (
						<span className="text-sm text-red-600">{musicError}</span>
					)}
				</div>

				{data === undefined ? (
					<p className="text-[var(--sea-ink-soft)]">Loading your data...</p>
				) : workoutCards.length === 0 ? (
					<p className="text-[var(--sea-ink-soft)]">
						No workout-music matches found. Fetch your workouts and music, then
						check back!
					</p>
				) : (
					<div className="space-y-6">
						{workoutCards.map((card) => (
							<WorkoutCard
								key={card.workoutId}
								card={card}
								shareUrl={data.hevyUsername ? `/${data.hevyUsername}/workouts/${card.hevyWorkoutId}` : undefined}
							/>
						))}
					</div>
				)}
			</section>
		</main>
	)
}
