import { createDashboardModel } from "./dashboard-model";
import { icon } from "./layout";
import { palette, layerOrder } from "./projection";
import { referencePalette } from "./reference-geometry";
import type { Snapshot, SourceLayer, ViewerState } from "./types";

type DashboardActions = {
  source(id: string): void;
  group(id: string): void;
  corpus(corpus: "workspace" | "literature"): void;
  layer(layer: SourceLayer | "all"): void;
  coverage(): void;
  overview(): void;
  form(form: ViewerState["mode"]): void;
};

const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const glyph = (name: string, className = "widget-icon") => {
  const node = element("span", className); node.innerHTML = icon(name, 16); return node;
};
const button = (label: string, action: () => void, className = "widget-action") => {
  const node = element("button", className, label); node.type = "button"; node.onclick = action; return node;
};

export function mountDashboard(snapshot: Snapshot, root: HTMLElement, actions: DashboardActions) {
  const model = createDashboardModel(snapshot);
  const left = root.querySelector<HTMLElement>("#dashboard-left");
  const right = root.querySelector<HTMLElement>("#dashboard-right");
  if (!left || !right) return { update(_state: ViewerState) {}, dispose() {} };
  const sourceButtons = new Map<HTMLButtonElement, string>();
  const layerButtons = new Map<HTMLButtonElement, typeof model.layers[number]>();
  const corpusButtons = new Map<HTMLButtonElement, ViewerState["corpus"]>();
  left.replaceChildren(); right.replaceChildren();

  function widget(host: HTMLElement, id: string, title: string, iconName: string, count?: number) {
    const section = element("section", `dashboard-widget widget-${id}`);
    const heading = element("div", "widget-heading");
    const headingId = `dashboard-${id}-title`;
    const titleNode = element("h2", "widget-title", title); titleNode.id = headingId;
    heading.append(glyph(iconName), titleNode);
    if (count !== undefined) heading.append(element("span", "widget-count", String(count)));
    section.setAttribute("aria-labelledby", headingId); section.append(heading); host.append(section);
    return { section, heading };
  }
  function sourceRow(sourceId: string, name: string, detail: string, iconName: string) {
    const row = button("", () => actions.source(sourceId), "widget-row");
    const copy = element("span", "widget-copy");
    copy.append(element("span", "widget-name", name), element("span", "widget-detail", detail));
    row.append(glyph(iconName), copy, glyph("arrow", "widget-arrow"));
    row.dataset.dashboardSource = sourceId; sourceButtons.set(row, sourceId); return row;
  }

  const pulse = widget(left, "pulse", "Workspace pulse", "graph");
  pulse.section.append(element("p", "dashboard-context", "Whole snapshot"));
  const stats = element("dl", "dashboard-stats");
  for (const [label, value] of [[model.projectLabel, model.totals.projects], ["Sources", model.totals.sources],
    ["Chunks", model.totals.chunks], ["Recorded links", model.totals.relations]] as const) {
    const item = element("div", "dashboard-stat");
    item.append(element("dt", undefined, label), element("dd", undefined, value.toLocaleString("en"))); stats.append(item);
  }
  pulse.section.append(stats);
  const lenses = element("div", "dashboard-lenses");
  for (const [corpus, label] of [["workspace", "Projects map"], ["literature", "Research map"]] as const) {
    const node = button(label, () => actions.corpus(corpus), "dashboard-lens");
    corpusButtons.set(node, corpus); lenses.append(node);
  }
  pulse.section.append(lenses);
  if (model.workspaceRoot) pulse.section.append(element("p", "dashboard-root", model.workspaceRoot));

  const apps = widget(left, "apps", "App manifests", "app", model.manifestCount);
  const appList = element("div", "widget-list");
  for (const item of model.manifests.slice(0, 4)) appList.append(sourceRow(item.source.id, item.name, item.path, "app"));
  if (!appList.children.length) appList.append(element("p", "dashboard-note", "No app manifests in this snapshot."));
  apps.section.append(appList, button("Explore all manifests", () => actions.layer("app")));

  const layers = widget(left, "layers", "Source layers", "layers", model.totals.sources);
  layers.section.append(element("p", "dashboard-context", "Whole snapshot · choose a layer"));
  const layerList = element("div", "layer-distribution");
  const largestLayer = Math.max(1, ...model.layers.map(layer => layer.count));
  for (const item of model.layers) {
    const row = button("", () => actions.layer(item.layer), "layer-row");
    row.disabled = item.count === 0;
    const label = element("span", "layer-row-label");
    label.append(element("span", undefined, item.name), element("span", "layer-row-count", String(item.count)));
    const meter = element("span", "layer-meter"); meter.setAttribute("aria-hidden", "true");
    const fill = element("span", "layer-meter-fill"); fill.style.width = `${item.count / largestLayer * 100}%`;
    meter.append(fill); row.append(label, meter); row.dataset.dashboardLayer = item.layer;
    layerButtons.set(row, item); layerList.append(row);
  }
  layers.section.append(layerList);

  const research = widget(right, "research", "Research connections", "book", model.researchCount);
  const researchList = element("div", "widget-list research-list");
  for (const item of model.research.slice(0, 3)) {
    researchList.append(sourceRow(item.source.id, item.name,
      `${item.referenceCount} cited URLs · ${item.sharedCount} shared`, "link"));
  }
  if (!researchList.children.length) researchList.append(element("p", "dashboard-note", "No research notes in this snapshot."));
  research.section.append(researchList, element("p", "dashboard-note", "Ranked by distinct cited URL records. Shared URLs appear in other notes."),
    button(`Explore research · ${model.citationCount} URL records`, () => actions.corpus("literature")));

  const skills = widget(right, "skills", "Skills deck", "skill", model.skills.length);
  const deck = element("div", "skills-deck");
  for (const item of model.skills.slice(0, 4)) {
    const tile = button("", () => actions.source(item.source.id), "skill-tile");
    tile.append(glyph("skill"), element("span", "skill-name", item.name), element("span", "skill-project", item.projectName));
    tile.dataset.dashboardSource = item.source.id; sourceButtons.set(tile, item.source.id); deck.append(tile);
  }
  if (!deck.children.length) deck.append(element("p", "dashboard-note", "No skill documents in this snapshot."));
  skills.section.append(deck, button("Explore skill documents", () => actions.layer("skill")));

  const coverage = widget(right, "coverage", "Snapshot coverage", "file");
  if (model.coverage) {
    const scan = model.coverage;
    if (scan.selectedFiles !== null && scan.discoveredFiles !== null) {
      const summary = element("p", "coverage-summary");
      summary.append(element("strong", undefined, `${scan.selectedFiles} / ${scan.discoveredFiles}`),
        element("span", undefined, "selected eligible files")); coverage.section.append(summary);
    } else coverage.section.append(element("p", "dashboard-note", "File discovery totals were not recorded."));
    if (scan.fraction !== null) {
      const track = element("div", "coverage-track"); track.setAttribute("aria-hidden", "true");
      const fill = element("span"); fill.style.width = `${scan.fraction * 100}%`; track.append(fill); coverage.section.append(track);
    }
    coverage.section.append(element("p", "dashboard-note", `Bounded read-only scan · depth ${scan.maxDepth}`));
    if (scan.warnings.length) coverage.section.append(element("p", "dashboard-warning", `${scan.warnings.length} scan warning${scan.warnings.length === 1 ? "" : "s"} recorded`));
  } else coverage.section.append(element("p", "dashboard-note", "This snapshot has no scan coverage metadata."));
  if (model.generatedAt) {
    const time = element("time", "dashboard-snapshot"); time.dateTime = model.generatedAt;
    time.textContent = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
    }).format(new Date(model.generatedAt)) + " UTC";
    coverage.section.append(time);
  } else coverage.section.append(element("p", "dashboard-note", "Snapshot date unavailable."));
  coverage.section.append(element("p", "dashboard-note", "Snapshot data · citation URLs are not fetched."),
    button("Inspect scan coverage", actions.coverage));

  return {
    update(state: ViewerState) {
      for (const [node, id] of sourceButtons) {
        const selected = state.selectedSourceId === id;
        node.classList.toggle("selected", selected); node.setAttribute("aria-pressed", String(selected));
      }
      for (const [node, item] of layerButtons) {
        const active = state.layer === item.layer && item.corpora.includes(state.corpus);
        node.classList.toggle("active", active); node.setAttribute("aria-pressed", String(active));
        node.style.setProperty("--layer-color", state.mode === "constellation" || state.mode === "orbital"
          ? referencePalette[item.layer] : palette[layerOrder.indexOf(item.layer)]!);
      }
      for (const [node, corpus] of corpusButtons) {
        const active = state.corpus === corpus;
        node.classList.toggle("active", active); node.setAttribute("aria-pressed", String(active));
      }
    },
    dispose() { left.replaceChildren(); right.replaceChildren(); },
  };
}
