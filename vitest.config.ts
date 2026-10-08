import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		setupFiles: ["./testing/setup.ts"],
		coverage: {
			provider: "v8",
			include: ["src/usage/**/*.ts", "extensions/**/*.ts"],
			exclude: ["**/index.ts", "**/*.test.ts", "**/types.ts"],
			thresholds: { statements: 95, branches: 95, functions: 95, lines: 95 },
		},
	},
});
