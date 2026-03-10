import { createFileRoute, Link } from "@tanstack/react-router"
import { useConvexAuth } from "convex/react"

export const Route = createFileRoute("/_app/")({ component: App })

function App() {
	const { isAuthenticated } = useConvexAuth()

	return (
		<main className="page-wrap px-4 pb-8 pt-14">
			<section className="island-shell rise-in relative overflow-hidden rounded-[2rem] px-6 py-10 sm:px-10 sm:py-14">
				<div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(79,184,178,0.32),transparent_66%)]" />
				<div className="pointer-events-none absolute -bottom-20 -right-20 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(47,106,74,0.18),transparent_66%)]" />
				<p className="island-kicker mb-3">Hevy + Spotify</p>
				<h1 className="display-title mb-5 max-w-3xl text-4xl leading-[1.02] font-bold tracking-tight text-[var(--sea-ink)] sm:text-6xl">
					Track your music alongside your workouts.
				</h1>
				<p className="mb-8 max-w-2xl text-base text-[var(--sea-ink-soft)] sm:text-lg">
					Connect your Spotify account to see what you were listening to during
					your workouts. Discover patterns between your music and your training.
				</p>
				<div className="flex flex-wrap gap-3">
					{isAuthenticated ? (
						<Link
							to="/dashboard"
							className="rounded-full border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.14)] px-5 py-2.5 text-sm font-semibold text-[var(--lagoon-deep)] no-underline transition hover:-translate-y-0.5 hover:bg-[rgba(79,184,178,0.24)]"
						>
							Go to Dashboard
						</Link>
					) : (
						<Link
							to="/login"
							className="inline-flex items-center gap-2 rounded-full bg-[#1db954] px-5 py-2.5 text-sm font-semibold text-white no-underline transition hover:-translate-y-0.5 hover:bg-[#1ed760]"
						>
							Get Started with Spotify
						</Link>
					)}
				</div>
			</section>
		</main>
	)
}
