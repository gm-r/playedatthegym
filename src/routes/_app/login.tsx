import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useAuthActions } from "@convex-dev/auth/react"
import { useConvexAuth } from "convex/react"
import { useEffect } from "react"

export const Route = createFileRoute("/_app/login")({ component: LoginPage })

function LoginPage() {
	const { signIn } = useAuthActions()
	const { isAuthenticated, isLoading } = useConvexAuth()
	const navigate = useNavigate()

	useEffect(() => {
		if (isAuthenticated) {
			navigate({ to: "/dashboard" })
		}
	}, [isAuthenticated, navigate])

	const handleSpotifyLogin = () => {
		void signIn("spotify")
	}

	if (isLoading) {
		return (
			<main className="page-wrap px-4 pb-8 pt-14">
				<p className="text-[var(--sea-ink-soft)]">Loading...</p>
			</main>
		)
	}

	return (
		<main className="page-wrap px-4 pb-8 pt-14">
			<section className="island-shell rise-in relative overflow-hidden rounded-[2rem] px-6 py-10 sm:px-10 sm:py-14">
				<div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(79,184,178,0.32),transparent_66%)]" />
				<div className="pointer-events-none absolute -bottom-20 -right-20 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(47,106,74,0.18),transparent_66%)]" />
				<h1 className="display-title mb-5 text-4xl font-bold tracking-tight text-[var(--sea-ink)]">
					Connect Your Spotify
				</h1>
				<p className="mb-8 max-w-2xl text-base text-[var(--sea-ink-soft)]">
					Sign in with your Spotify account to track your listening history and
					correlate it with your workouts.
				</p>
				<button
					type="button"
					onClick={handleSpotifyLogin}
					className="inline-flex items-center gap-2 rounded-full bg-[#1db954] px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#1ed760]"
				>
					<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
						<path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
					</svg>
					Sign in with Spotify
				</button>
			</section>
		</main>
	)
}
