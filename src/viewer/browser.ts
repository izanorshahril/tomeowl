import { shellMarkup } from "./layout";
import { mountViewer } from "./render";
import type { Snapshot } from "./types";

declare global { interface Window { __TOMEOWL_SNAPSHOT__?: Snapshot } }

const mount = () => {
  const snapshot = window.__TOMEOWL_SNAPSHOT__;
  const app = document.querySelector<HTMLElement>("#tomeowl-viewer");
  if (!snapshot || !app) return;
  app.innerHTML = shellMarkup(snapshot);
  mountViewer(snapshot, app);
};

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
else mount();
