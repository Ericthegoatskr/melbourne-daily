import { build } from "esbuild";
import { resolve } from "node:path";

const output = process.argv[2] || "dist-api/index.js";
await build({
  entryPoints: ["server/index.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outfile: resolve(output),
  sourcemap: false,
  minify: false,
});
console.log(`API worker built: ${resolve(output)}`);
