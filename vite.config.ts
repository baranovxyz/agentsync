import { isAbsolute, resolve, win32 } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/cli.ts"),
      formats: ["es"],
      fileName: "cli",
    },
    rollupOptions: {
      // Avoid code-splitting: Vite/Rollup drops re-exported node:fs/promises
      // bindings from chunk imports while still emitting the re-export statements,
      // causing ReferenceErrors at runtime.
      output: {
        inlineDynamicImports: true,
      },
      external: (id) => {
        // Externalize all node built-ins (with or without node: prefix, including subpaths)
        if (id.startsWith("node:")) {
          return true;
        }
        // Check for node built-ins without node: prefix (including subpaths like fs/promises)
        const builtins = [
          "fs",
          "path",
          "os",
          "crypto",
          "util",
          "stream",
          "child_process",
          "zlib",
          "url",
          "http",
          "https",
          "net",
          "tls",
          "events",
          "assert",
          "buffer",
          "querystring",
          "string_decoder",
          "timers",
          "vm",
          "process",
          "module",
        ];
        for (const builtin of builtins) {
          if (id === builtin || id.startsWith(`${builtin}/`)) {
            return true;
          }
        }
        // Externalize fs-extra (bundling causes issues with methods like fs.stat)
        if (id === "fs-extra" || id.startsWith("fs-extra/")) {
          return true;
        }
        // Externalize bare node_modules imports, but keep entry/internal files bundled.
        return !(
          id.startsWith(".") ||
          id.startsWith("/") ||
          isAbsolute(id) ||
          win32.isAbsolute(id)
        );
      },
    },
    target: "node20",
    minify: false,
    // The npm package ships a single executable file. Keeping source maps out
    // of dist avoids publishing source comments and prevents a dangling map
    // reference when the package allowlist includes only dist/cli.js.
    sourcemap: false,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
