import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
    resolve: {
        alias: {
            // Mirror SvelteKit's `$lib` alias so unit tests can import modules
            // that reference `$lib/...` the same way the app does.
            $lib: fileURLToPath(new URL("./src/lib", import.meta.url)),
        },
    },
    test: {
        environment: "node",
        include: ["src/**/*.{test,spec}.ts"],
    },
});
