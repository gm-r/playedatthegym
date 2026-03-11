import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useConvexAuth, useQuery } from "convex/react"
import { useAction } from "convex/react"
import { api } from "../../../convex/_generated/api"
import { useEffect, useState } from "react"

export const Route = createFileRoute("/_app/settings")({
	component: SettingsPage,
})

function SettingsPage() {
	const { isAuthenticated, isLoading } = useConvexAuth()
	const navigate = useNavigate()
	const setupIntegration = useAction(api.hevyUsers.setupHevyIntegration)
	const status = useQuery(
		api.hevyUsers.getIntegrationStatus,
		isAuthenticated ? {} : "skip",
	)

	const [apiKey, setApiKey] = useState("")
	const [connecting, setConnecting] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [showSecret, setShowSecret] = useState(false)
	const [copied, setCopied] = useState<string | null>(null)
	const [showReconnect, setShowReconnect] = useState(false)

	useEffect(() => {
		if (!isLoading && !isAuthenticated) {
			navigate({ to: "/login" })
		}
	}, [isLoading, isAuthenticated, navigate])

	if (isLoading || !isAuthenticated) {
		return (
			<main className="page-wrap px-4 pb-8 pt-14">
				<p className="text-[var(--sea-ink-soft)]">Loading...</p>
			</main>
		)
	}

	const handleConnect = async () => {
		if (!apiKey.trim()) return
		setConnecting(true)
		setError(null)
		try {
			await setupIntegration({ apiKey: apiKey.trim() })
			setApiKey("")
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : "Failed to connect")
		} finally {
			setConnecting(false)
		}
	}

	const handleCopy = (text: string, label: string) => {
		navigator.clipboard.writeText(text)
		setCopied(label)
		setTimeout(() => setCopied(null), 2000)
	}

	const btnClass =
		"rounded-full border border-[rgba(23,58,64,0.2)] bg-white/50 px-4 py-2 text-sm font-semibold text-[var(--sea-ink)] transition hover:-translate-y-0.5 hover:border-[rgba(23,58,64,0.35)] disabled:opacity-50"

	return (
		<main className="page-wrap px-4 pb-8 pt-14">
			<section className="island-shell rise-in rounded-[2rem] px-6 py-10 sm:px-10 sm:py-14">
				<div className="mb-6 flex items-center justify-between">
					<h1 className="display-title text-4xl font-bold tracking-tight text-[var(--sea-ink)]">
						Settings
					</h1>
					<button
						type="button"
						onClick={() => navigate({ to: "/dashboard" })}
						className={btnClass}
					>
						Back to Dashboard
					</button>
				</div>

				<h2 className="mb-4 text-xl font-semibold text-[var(--sea-ink)]">
					Hevy Integration
				</h2>

				{status === undefined ? (
					<p className="text-[var(--sea-ink-soft)]">Loading...</p>
				) : status.connected ? (
					<div className="space-y-4">
						<p className="text-sm text-[var(--sea-ink-soft)]">
							Connected as <span className="font-semibold text-[var(--sea-ink)]">{status.hevyUsername}</span>
						</p>

						<div>
							<label className="mb-1 block text-sm font-medium text-[var(--sea-ink)]">
								Webhook URL
							</label>
							{(() => {
								const webhookUrl = `${import.meta.env.VITE_CONVEX_SITE_URL}/ingest/hevy/workout/${status.hevyId}`
								return (
									<div className="flex items-center gap-2">
										<code className="flex-1 rounded-lg border border-[rgba(23,58,64,0.15)] bg-white/50 px-3 py-2 text-sm break-all">
											{webhookUrl}
										</code>
										<button
											type="button"
											onClick={() => handleCopy(webhookUrl, "url")}
											className={btnClass}
										>
											{copied === "url" ? "Copied!" : "Copy"}
										</button>
									</div>
								)
							})()}
						</div>

						<div>
							<label className="mb-1 block text-sm font-medium text-[var(--sea-ink)]">
								Bearer Token
							</label>
							<div className="flex items-center gap-2">
								<code className="flex-1 rounded-lg border border-[rgba(23,58,64,0.15)] bg-white/50 px-3 py-2 text-sm break-all">
									{showSecret ? status.webhookSecret : "••••••••••••••••"}
								</code>
								<button
									type="button"
									onClick={() => setShowSecret(!showSecret)}
									className={btnClass}
								>
									{showSecret ? "Hide" : "Show"}
								</button>
								<button
									type="button"
									onClick={() => handleCopy(status.webhookSecret, "secret")}
									className={btnClass}
								>
									{copied === "secret" ? "Copied!" : "Copy"}
								</button>
							</div>
						</div>

						<p className="text-xs text-[var(--sea-ink-soft)]">
							Paste the webhook URL and bearer token into your Hevy webhook settings.
						</p>

						{showReconnect ? (
							<ConnectForm
								apiKey={apiKey}
								setApiKey={setApiKey}
								connecting={connecting}
								error={error}
								onConnect={handleConnect}
								btnClass={btnClass}
							/>
						) : (
							<button
								type="button"
								onClick={() => {
									setError(null)
									setApiKey("")
									setShowReconnect(true)
								}}
								className={btnClass}
							>
								Reconnect
							</button>
						)}
					</div>
				) : (
					<ConnectForm
						apiKey={apiKey}
						setApiKey={setApiKey}
						connecting={connecting}
						error={error}
						onConnect={handleConnect}
						btnClass={btnClass}
					/>
				)}
			</section>
		</main>
	)
}

function ConnectForm({
	apiKey,
	setApiKey,
	connecting,
	error,
	onConnect,
	btnClass,
}: {
	apiKey: string
	setApiKey: (v: string) => void
	connecting: boolean
	error: string | null
	onConnect: () => void
	btnClass: string
}) {
	return (
		<div className="space-y-4">
			<p className="text-sm text-[var(--sea-ink-soft)]">
				Enter your Hevy API key to connect your account and get a webhook URL.
			</p>
			<div className="flex items-center gap-2">
				<input
					type="text"
					value={apiKey}
					onChange={(e) => setApiKey(e.target.value)}
					placeholder="Your Hevy API key"
					className="flex-1 rounded-lg border border-[rgba(23,58,64,0.2)] bg-white/50 px-3 py-2 text-sm text-[var(--sea-ink)] placeholder:text-[var(--sea-ink-soft)] focus:border-[rgba(23,58,64,0.4)] focus:outline-none"
				/>
				<button
					type="button"
					onClick={onConnect}
					disabled={connecting || !apiKey.trim()}
					className={btnClass}
				>
					{connecting ? "Connecting..." : "Connect"}
				</button>
			</div>
			{error && <p className="text-sm text-red-600">{error}</p>}
		</div>
	)
}
