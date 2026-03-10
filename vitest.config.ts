import { defineConfig } from "vitest/config"

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["convex/**/*.test.ts"],
		setupFiles: ["convex/__tests__/setup.ts"],
	},
})
