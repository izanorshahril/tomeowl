import { fileURLToPath } from "node:url";

// Generate the authored browser application before compiling the CLI. The compiled CLI
// imports this artifact as text, so exporting remains independent of Bun at runtime.
const result = await Bun.build({
  entrypoints: [fileURLToPath(new URL("./browser.ts", import.meta.url))],
  outdir: fileURLToPath(new URL("./", import.meta.url)),
  naming: "browser.bundle.js",
  target: "browser",
  minify: true,
  sourcemap: "none",
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
console.error("Built src/viewer/browser.bundle.js");
