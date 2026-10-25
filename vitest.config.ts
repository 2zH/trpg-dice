import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "happy-dom", include: ["src/**/*.test.{ts,tsx}", "demo/**/*.test.ts"] } });
