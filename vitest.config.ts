import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      clean: true,
      exclude: ["src/**/index.ts", "src/**/types.ts", "src/storage/repository.ts"],
      include: ["src/**/*.ts"],
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "coverage",
      thresholds: {
        branches: 90,
        functions: 100,
        lines: 95,
        statements: 95,
      },
    },
  },
});
