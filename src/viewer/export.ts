import styles from "./viewer.css" with { type: "text" };
import script from "./browser.bundle.js" with { type: "text" };
import type { Snapshot } from "./types";

function validateSnapshot(value: Snapshot) {
  if (!value || value.schemaVersion !== 1 || !Array.isArray(value.sources) || !Array.isArray(value.relations)) {
    throw new TypeError("Unsupported Tomeowl snapshot: expected schemaVersion 1 with sources and relations.");
  }
  if (!value.stats || ![value.stats.sources, value.stats.chunks, value.stats.relations].every((count) => Number.isSafeInteger(count) && count >= 0)) {
    throw new TypeError("Unsupported Tomeowl snapshot: stats must contain non-negative integer counts.");
  }
  if (typeof value.generatedAt !== "string") throw new TypeError("Unsupported Tomeowl snapshot: generatedAt must be a string.");
}

function safeScriptJson(value: unknown) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) => ({
    "<": "\\u003c", ">": "\\u003e", "&": "\\u0026", "\u2028": "\\u2028", "\u2029": "\\u2029",
  })[character]!);
}

export async function renderSnapshot(snapshot: Snapshot): Promise<string> {
  validateSnapshot(snapshot);
  const data = safeScriptJson(snapshot);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark"><title>Tomeowl · Local archive</title><style>${styles}</style></head>
<body><div id="tomeowl-viewer"></div><script>window.__TOMEOWL_SNAPSHOT__=${data};</script><script>${script}</script></body></html>`;
}
