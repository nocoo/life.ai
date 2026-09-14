import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { verifyLocalBindings } from "./scripts/verify-test-bindings.ts";

const testState = process.env.LIFE_TEST_STATE;
if (testState) verifyLocalBindings(testState);

export default defineConfig({
	cacheDir: testState ? `${testState}/vite-cache` : "node_modules/.vite",
	plugins: [
		react(),
		tailwindcss(),
		cloudflare({
			viteEnvironment: { name: "worker" },
			persistState: { path: testState ?? ".wrangler/state" },
			remoteBindings: process.env.CLOUDFLARE_ENV === "devprod",
			inspectorPort: false,
			config: testState
				? (config) => ({
						vars: {
							...config.vars,
							RESOURCE_ENV: "test",
							TEST_ACCESS_JWKS: process.env.LIFE_TEST_JWKS ?? "",
							AI_SETTINGS_KEY: process.env.LIFE_TEST_AI_SETTINGS_KEY ?? "",
						},
					})
				: undefined,
		}),
	],
	server: {
		host: "127.0.0.1",
		port: 7011,
		strictPort: true,
		allowedHosts: [
			"life.dev.hexly.ai",
			...(testState ? ["life.worker.hexly.ai", "life.hexly.ai"] : []),
		],
		watch: {
			ignored: [
				"**/.wrangler/**",
				"**/coverage/**",
				"**/test-results/**",
				"**/playwright-report/**",
			],
		},
	},
	build: { sourcemap: true },
	worker: { format: "es" },
});
