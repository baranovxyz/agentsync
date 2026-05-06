import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// CI multiplier: Tests run 2x slower on CI machines
const CI_MULTIPLIER = process.env.CI ? 2 : 1;

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    exclude: ["node_modules/**"],

    // Hierarchical timeouts with CI adjustment
    testTimeout: 5000 * CI_MULTIPLIER, // Unit tests: 5s local, 10s CI
    hookTimeout: 10000 * CI_MULTIPLIER, // Setup/teardown: 10s local, 20s CI

    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "dist/",
        "scripts/",
        "*.config.ts",
        "tests/fixtures/",
      ],
      // Note: Coverage thresholds disabled - they cause false failures on some CI platforms
      // Coverage is monitored separately via Codecov
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  esbuild: {
    target: "es2022",
  },
});
