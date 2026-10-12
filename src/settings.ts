import type { ProFeature, ProGate } from "./docx/pro";

/** Everything that shapes one export. Free fields work without a key; header/footer/pageNumbers are Pro (the engine checks the gate). */
export interface ExportSettings {
  outlineMode: "headings" | "lists";
  headingDepth: number;
  pageProperties: "drop" | "keep";
  titleHeading: boolean;
  pageSize: "A4" | "Letter";
  toc: boolean;
  header: string;
  footer: string;
  pageNumbers: boolean;
}

export const DEFAULT_SETTINGS: ExportSettings = {
  outlineMode: "headings",
  headingDepth: 3,
  pageProperties: "drop",
  titleHeading: true,
  pageSize: "A4",
  toc: false,
  header: "",
  footer: "",
  pageNumbers: false,
};

/** Pro-only features in this plugin. The licence check is the only thing that opens them. */
const PRO: ProFeature[] = ["headerFooter", "batch"];

export class LogseqProGate implements ProGate {
  constructor(private active: boolean) {}
  has(f: ProFeature): boolean {
    return this.active && PRO.includes(f);
  }
}

export class ProLockedError extends Error {
  constructor(feature: string) {
    super(`${feature} is a Pro feature. Add your licence key in the plugin settings (see the README).`);
  }
}

export type SavedPresets = Record<string, Partial<ExportSettings>>;
export const MAX_PRESETS = 20;
const NAME = /^[\w .()+-]{1,40}$/;

/** Coerce whatever is in Logseq's settings store into a valid ExportSettings (the store is user-editable JSON). */
export function normalizeSettings(raw: Partial<Record<keyof ExportSettings, unknown>> | undefined | null): ExportSettings {
  const r = raw ?? {};
  const d = DEFAULT_SETTINGS;
  const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");
  const depth = Number(r.headingDepth);
  return {
    outlineMode: r.outlineMode === "lists" ? "lists" : "headings",
    headingDepth: Number.isFinite(depth) && depth >= 1 && depth <= 6 ? Math.round(depth) : d.headingDepth,
    pageProperties: r.pageProperties === "keep" ? "keep" : "drop",
    titleHeading: typeof r.titleHeading === "boolean" ? r.titleHeading : d.titleHeading,
    pageSize: r.pageSize === "Letter" ? "Letter" : "A4",
    toc: r.toc === true,
    header: str(r.header),
    footer: str(r.footer),
    pageNumbers: r.pageNumbers === true,
  };
}

/** Save the current settings under a name. Pro. Returns the new store; never mutates the old one. */
export function savePreset(store: SavedPresets, name: string, current: ExportSettings, gate: ProGate): SavedPresets {
  if (!gate.has("headerFooter")) throw new ProLockedError("Saved presets");
  const n = name.trim();
  if (!NAME.test(n)) throw new Error("Preset names use letters, digits, spaces and . ( ) + - _ (up to 40 characters).");
  if (!(n in store) && Object.keys(store).length >= MAX_PRESETS) throw new Error(`At most ${MAX_PRESETS} presets.`);
  return { ...store, [n]: { ...current } };
}

/** Settings after applying a saved preset on top of `current`. Pro; an unknown name is an error. */
export function applyPreset(store: SavedPresets, name: string, current: ExportSettings, gate: ProGate): ExportSettings {
  if (!gate.has("headerFooter")) throw new ProLockedError("Saved presets");
  const p = store[name];
  if (!p) throw new Error(`No saved preset called "${name}".`);
  return normalizeSettings({ ...current, ...p });
}

/** logseq.useSettingsSchema input. Order is the order in the settings pane. */
export const SETTINGS_SCHEMA = [
  { key: "outlineMode", type: "enum", title: "Outline mapping", description: "Headings: blocks with children become Word headings down to the depth below, deeper blocks become nested lists. Lists: every block is a list item.", default: "headings", enumChoices: ["headings", "lists"], enumPicker: "select" },
  { key: "headingDepth", type: "enum", title: "Heading depth", description: "How many outline levels become headings (Headings mode only).", default: "3", enumChoices: ["1", "2", "3", "4", "5", "6"], enumPicker: "select" },
  { key: "pageProperties", type: "enum", title: "Page properties", description: "Drop them, or keep them as a small table under the title.", default: "drop", enumChoices: ["drop", "keep"], enumPicker: "select" },
  { key: "titleHeading", type: "boolean", title: "Page title as heading", description: "Start the document with the page name as a title heading.", default: true },
  { key: "pageSize", type: "enum", title: "Page size", description: "", default: "A4", enumChoices: ["A4", "Letter"], enumPicker: "select" },
  { key: "toc", type: "boolean", title: "Table of contents", description: "Insert a Word table of contents (Word asks to update fields when opening).", default: false },
  { key: "licenseKey", type: "string", title: "Pro licence key", description: "Optional. Unlocks header/footer, page numbers, saved presets and batch export. Checked once with Gumroad when you change it; nothing else is sent.", default: "" },
  { key: "header", type: "string", title: "Header text (Pro)", description: "Printed at the top of every page.", default: "" },
  { key: "footer", type: "string", title: "Footer text (Pro)", description: "Printed at the bottom of every page.", default: "" },
  { key: "pageNumbers", type: "boolean", title: "Page numbers (Pro)", description: "Adds 'Page X of Y' to the footer.", default: false },
  { key: "newPresetName", type: "string", title: "New preset name (Pro)", description: "Type a name, then run the command 'Save current settings as preset'.", default: "" },
  { key: "activePreset", type: "string", title: "Preset to apply (Pro)", description: "Name of a saved preset; run the command 'Apply preset' to load it into the settings above.", default: "" },
  { key: "batchPages", type: "string", title: "Batch pages (Pro)", description: "Page names separated by commas, or a namespace ending in a slash (Projects/). Run the command 'Export pages (batch) to .zip'.", default: "" },
];
