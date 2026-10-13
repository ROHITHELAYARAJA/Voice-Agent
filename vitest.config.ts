import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./apps/web/src", import.meta.url)) },
  },
  test: {
    include: [
      "tests/calmloop/**/*.test.ts",
      "tests/ui/**/*.test.ts",
      "supabase/tests/**/*.test.ts",
    ],
    testTimeout: 30000,
  },
});
