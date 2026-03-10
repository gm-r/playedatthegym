import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "convex/react"
import { api } from "../../../../../convex/_generated/api"
import type { Id } from "../../../../../convex/_generated/dataModel"
import { buildWorkoutCards } from "../../../../../convex/matching"
import { useMemo } from "react"
import { WorkoutCard } from "../../../../components/workout"

export const Route = createFileRoute(
	"/_standalone/$userId/workouts/$workoutId",
)({
	component: PublicWorkoutPage,
})

function PublicWorkoutPage() {
	const { userId, workoutId } = Route.useParams()

	const data = useQuery(api.publicWorkout.getWorkoutWithMusic, {
		userId: userId as Id<"users">,
		hevyWorkoutId: workoutId,
	})

	const workoutCard = useMemo(() => {
		if (!data?.workout) return null
		const cards = buildWorkoutCards([data.workout], data.musicHistory)
		return cards[0] ?? null
	}, [data])

	if (data === undefined) {
		return (
			<main className="page-wrap px-4 pb-8 pt-10">
				<p className="text-[var(--sea-ink-soft)]">Loading workout...</p>
			</main>
		)
	}

	if (data === null || !workoutCard) {
		return (
			<main className="page-wrap px-4 pb-8 pt-10">
				<p className="text-[var(--sea-ink)]">Workout not found.</p>
			</main>
		)
	}

	return (
		<main className="page-wrap px-4 pb-8 pt-6">
			<WorkoutCard card={workoutCard} />
		</main>
	)
}
