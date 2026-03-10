import { createFileRoute, Outlet } from "@tanstack/react-router"
import Header from "../components/Header"
import Footer from "../components/Footer"

export const Route = createFileRoute("/_app")({
	component: AppLayout,
})

function AppLayout() {
	return (
		<>
			<Header />
			<Outlet />
			<Footer />
		</>
	)
}
