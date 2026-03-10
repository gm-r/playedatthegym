import { cronJobs } from "convex/server"
import { internal } from "./_generated/api"

const crons = cronJobs()

crons.interval(
	"sync workouts and music",
	{ minutes: 15 },
	internal.sync.syncWorkoutsAndMusic,
)

export default crons
