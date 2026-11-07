import { build } from "esbuild";
import { resolve } from "node:path";

// A separate deployment entry point exposes only the transport read endpoint.
const output = process.argv[2] || "dist-api/transit.js";
await build({
  entryPoints: ["server/transit-public.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outfile: resolve(output),
  sourcemap: false,
  minify: false,
});
console.log(`Public transit worker built: ${resolve(output)}`);
