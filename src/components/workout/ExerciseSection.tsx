import type { WorkoutWithSongs } from "../../../convex/matching"
import { SetRow } from "./SetRow"

export function ExerciseSection({
	exercise,
}: { exercise: WorkoutWithSongs["exercises"][number] }) {
	return (
		<div>
			<h4 className="mb-1 text-sm font-semibold text-[var(--sea-ink)]">
				{exercise.title}
			</h4>
			{exercise.notes && (
				<p className="mb-2 text-xs italic text-[var(--sea-ink-soft)]">
					{exercise.notes}
				</p>
			)}
			<div className="space-y-2">
				{exercise.sets.map((set, i) => (
					<SetRow key={i} set={set} />
				))}
			</div>
		</div>
	)
}
