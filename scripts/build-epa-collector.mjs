import { build } from "esbuild";
import { resolve } from "node:path";

await build({
  entryPoints: ["scripts/collect-epa.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  outfile: resolve("dist-tools/collect-epa.mjs"),
  sourcemap: false,
  minify: false,
});
console.log("EPA collector built outside the public Pages artifact.");
