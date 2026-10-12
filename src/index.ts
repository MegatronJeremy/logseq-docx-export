import "@logseq/libs";
import { exportBatch, exportPageToDocx, expandBatchPages, safeFileName } from "./export";
import type { BlockEntity } from "./blocks";
import { verifyLicense, applyLicenseResult, type HttpPost } from "./license";
import {
  SETTINGS_SCHEMA,
  LogseqProGate,
  normalizeSettings,
  savePreset,
  applyPreset,
  ProLockedError,
  type SavedPresets,
} from "./settings";

const LABEL = "Export page to .docx";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Best-effort local read of an asset in the graph folder. Logseq writes asset links relative to pages/ ("../assets/x.png"),
 * so leading "./" and "../" are dropped and the rest is read from the graph root through Logseq's own assets:// protocol.
 * Logseq OG 1.0.0 serves assets:// to XMLHttpRequest from the plugin iframe but fetch() on it fails, so XHR is used.
 * Returns null on any failure (the image becomes a note in the document). Remote URLs are never requested.
 */
function xhrBytes(url: string): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    try {
      const x = new XMLHttpRequest();
      x.open("GET", url);
      x.responseType = "arraybuffer";
      x.onload = () => resolve(x.response && (x.status === 200 || x.status === 0) ? new Uint8Array(x.response as ArrayBuffer) : null);
      x.onerror = () => resolve(null);
      x.send();
    } catch {
      resolve(null);
    }
  });
}

async function readAsset(graphPath: string, src: string): Promise<Uint8Array | null> {
  if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return null;
  const rel = src.replace(/^(\.\.?\/)+/, "").replace(/^\//, "");
  const base = graphPath.replace(/\/$/, "");
  // Names may be written raw ("Zoë diagram.png") or percent-encoded ("Zo%C3%AB%20diagram.png"): try both forms.
  const decoded = (() => {
    try {
      return decodeURIComponent(rel);
    } catch {
      return rel;
    }
  })();
  const paths = [...new Set([decoded, rel])];
  const urls: string[] = [];
  for (const p of paths) {
    const full = base + "/" + p;
    urls.push("assets://" + encodeURI(full), "assets://" + full, "file://" + encodeURI(full), "file://" + full);
  }
  for (const url of [...new Set(urls)]) {
    const bytes = await xhrBytes(url);
    if (bytes && bytes.length) return bytes;
  }
  return null;
}

function download(bytes: Uint8Array, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const cfg = () => (logseq.settings ?? {}) as Record<string, unknown>;
const gate = () => new LogseqProGate(cfg().proActive === true);
const settings = () => normalizeSettings(cfg() as never);
const presets = () => ((cfg().savedPresets as SavedPresets | undefined) ?? {}) as SavedPresets;
const msg = (m: string, kind: "success" | "warning" | "error" = "success") => logseq.UI.showMsg(m, kind);
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function common() {
  const graph = await logseq.App.getCurrentGraph();
  return {
    settings: settings(),
    gate: gate(),
    resolveImage: graph?.path ? (src: string) => readAsset(graph.path, src) : undefined,
    loadBlock: async (uuid: string) => ((await logseq.Editor.getBlock(uuid, { includeChildren: true })) ?? null) as BlockEntity | null,
    loadPage: async (name: string) => ((await logseq.Editor.getPageBlocksTree(name)) ?? null) as BlockEntity[] | null,
  };
}

async function exportPage(pageName: string | undefined): Promise<void> {
  try {
    let name = pageName;
    if (!name) {
      const cur = (await logseq.Editor.getCurrentPage()) as { originalName?: string; name?: string } | null;
      name = cur?.originalName ?? cur?.name;
    }
    if (!name) return void (await msg("Open a page first.", "warning"));
    // The page-menu event passes the lower-cased page name; the real title (and file name) is originalName.
    const info = (await logseq.Editor.getPage(name)) as { originalName?: string } | null;
    if (info?.originalName) name = info.originalName;
    const tree = ((await logseq.Editor.getPageBlocksTree(name)) ?? []) as unknown as BlockEntity[];
    const bytes = await exportPageToDocx(tree, { title: name, ...(await common()) });
    download(bytes, safeFileName(name) + ".docx", DOCX);
    await msg(`Exported "${name}" to .docx`);
  } catch (e) {
    await msg("Export failed: " + errText(e), "error");
  }
}

async function batch(): Promise<void> {
  try {
    if (!gate().has("batch")) throw new ProLockedError("Batch export");
    const pages = ((await logseq.Editor.getAllPages()) ?? []) as { originalName?: string; name?: string }[];
    const all = pages.map((p) => p.originalName ?? p.name ?? "").filter(Boolean);
    const names = expandBatchPages(String(cfg().batchPages ?? ""), all);
    if (!names.length) return void (await msg("Set 'Batch pages' in the plugin settings first.", "warning"));
    const c = await common();
    const r = await exportBatch(names, {
      ...c,
      loadTree: async (n) => ((await logseq.Editor.getPageBlocksTree(n)) ?? null) as BlockEntity[] | null,
    });
    download(r.zip, "logseq-pages.zip", "application/zip");
    await msg(`Exported ${r.exported.length} page(s)` + (r.failed.length ? `, ${r.failed.length} failed: ${r.failed.map((f) => f.name).join(", ")}` : ""), r.failed.length ? "warning" : "success");
  } catch (e) {
    await msg("Batch export failed: " + errText(e), "error");
  }
}

/** One POST to Gumroad, only when the key was typed or the user asked for a re-check. */
async function checkLicence(): Promise<void> {
  const key = String(cfg().licenseKey ?? "").trim();
  if (!key) return void logseq.updateSettings({ proActive: false });
  const post: HttpPost = async (url, init) => {
    const r = await fetch(url, init);
    return { status: r.status, json: () => r.json() as Promise<unknown> };
  };
  const r = await verifyLicense(key, post);
  const next = applyLicenseResult({ proActive: cfg().proActive === true, licenseKey: key }, r, key);
  logseq.updateSettings({ proActive: next.proActive });
  await msg(r.message, r.status === "valid" ? "success" : "warning");
}

async function main(): Promise<void> {
  logseq.useSettingsSchema(SETTINGS_SCHEMA as never);
  logseq.Editor.registerSlashCommand(LABEL, () => exportPage(undefined));
  logseq.App.registerPageMenuItem(LABEL, (e) => exportPage(e.page));
  logseq.App.registerCommandPalette({ key: "docx-export-batch", label: "DOCX Export: Export pages (batch) to .zip" }, batch);
  logseq.App.registerCommandPalette({ key: "docx-export-recheck", label: "DOCX Export: Re-check Pro licence" }, checkLicence);
  logseq.App.registerCommandPalette({ key: "docx-export-save-preset", label: "DOCX Export: Save current settings as preset" }, async () => {
    try {
      const name = String(cfg().newPresetName ?? "");
      logseq.updateSettings({ savedPresets: savePreset(presets(), name, settings(), gate()) });
      await msg(`Saved preset "${name.trim()}"`);
    } catch (e) {
      await msg(errText(e), "warning");
    }
  });
  logseq.App.registerCommandPalette({ key: "docx-export-apply-preset", label: "DOCX Export: Apply preset" }, async () => {
    try {
      const next = applyPreset(presets(), String(cfg().activePreset ?? "").trim(), settings(), gate());
      logseq.updateSettings({ ...next });
      await msg("Preset applied");
    } catch (e) {
      await msg(errText(e), "warning");
    }
  });
  let lastKey = String(cfg().licenseKey ?? "");
  logseq.onSettingsChanged((s: Record<string, unknown>) => {
    const k = String(s.licenseKey ?? "");
    if (k !== lastKey) {
      lastKey = k;
      void checkLicence();
    }
  });
}

logseq.ready(main).catch(console.error);
