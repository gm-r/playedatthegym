import { createFileRoute } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { ConvexHttpClient } from "convex/browser"
import { api } from "../../../../../convex/_generated/api"
import {
	buildWorkoutCards,
	type WorkoutWithSongs,
} from "../../../../../convex/matching"
import { WorkoutCard } from "../../../../components/workout"

const fetchWorkoutSSR = createServerFn({ method: "GET" })
	.inputValidator(
		(input: { hevyUserName: string; workoutId: string }) => input,
	)
	.handler(async ({ data: { hevyUserName, workoutId } }) => {
		const convexUrl = process.env.VITE_CONVEX_URL ?? (import.meta as any).env.VITE_CONVEX_URL
		if (!convexUrl) throw new Error("Missing VITE_CONVEX_URL")

		const client = new ConvexHttpClient(convexUrl)
		const result = await client.query(api.publicWorkout.getWorkoutWithMusic, {
			hevyUsername: hevyUserName,
			hevyWorkoutId: workoutId,
		})

		if (!result?.workout) return null

		const cards = buildWorkoutCards([result.workout], result.musicHistory)
		return cards[0] ?? null
	})

export const Route = createFileRoute(
	"/_standalone/$hevyUserName/workouts/$workoutId",
)({
	loader: async ({ params }) => {
		return fetchWorkoutSSR({
			data: { hevyUserName: params.hevyUserName, workoutId: params.workoutId },
		})
	},
	head: ({ loaderData }) => {
		const card = loaderData as WorkoutWithSongs | null
		if (!card) {
			return {
				meta: [{ title: "Workout Not Found" }],
			}
		}

		const totalSets = card.exercises.reduce(
			(sum, ex) => sum + ex.sets.length,
			0,
		)
		const hours = Math.floor(card.durationMinutes / 60)
		const mins = card.durationMinutes % 60
		const durationLabel = hours === 0 ? `${mins} min` : mins === 0 ? `${hours}h` : `${hours}h ${mins} min`
		const description = `${card.title} — ${card.exercises.length} exercises, ${totalSets} sets, ${durationLabel}`

		return {
			meta: [
				{ title: `${card.title} | Workout` },
				{ name: "description", content: description },
				{ property: "og:title", content: card.title },
				{ property: "og:description", content: description },
				{ property: "og:type", content: "website" },
				{ name: "twitter:card", content: "summary" },
				{ name: "twitter:title", content: card.title },
				{ name: "twitter:description", content: description },
			],
		}
	},
	component: PublicWorkoutPage,
})

function PublicWorkoutPage() {
	const card = Route.useLoaderData() as WorkoutWithSongs | null

	if (!card) {
		return (
			<main className="page-wrap px-4 pb-8 pt-10">
				<p className="text-[var(--sea-ink)]">Workout not found.</p>
			</main>
		)
	}

	return (
		<main className="page-wrap px-4 pb-8 pt-6">
			<WorkoutCard card={card} />
		</main>
	)
}
