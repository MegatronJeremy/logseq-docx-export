import JSZip from "jszip";
import { indexBlocks, type BlockEntity } from "./blocks";
import { exportToDocx } from "./docx/exporter";
import { FreeGate, type ProGate } from "./docx/pro";
import { findEmbeds, blocksToMarkdown } from "./outline";
import { DEFAULT_SETTINGS, ProLockedError, type ExportSettings } from "./settings";

export interface PageExportOptions {
  title: string;
  settings?: ExportSettings;
  /** Pro gate; default FreeGate. */
  gate?: ProGate;
  /** Return image bytes for a path used in the page (e.g. "assets/pic.png"), or null. Never fetches over the network. */
  resolveImage?: (src: string) => Promise<Uint8Array | null>;
  /** Load a block by uuid (for ((uuid)) refs and {{embed}} outside the exported page). */
  loadBlock?: (uuid: string) => Promise<BlockEntity | null>;
  /** Load a page's block tree by name (for {{embed [[Page]]}}). */
  loadPage?: (name: string) => Promise<BlockEntity[] | null>;
}

const REF = /\(\(([0-9a-fA-F-]{36})\)\)/g;
const MAX_LOADS = 150;

/** Pre-load what refs and embeds point at (outside the page), 2 rounds deep, so the conversion can stay synchronous. */
async function loadTargets(tree: BlockEntity[], opts: PageExportOptions) {
  const blocks = new Map<string, BlockEntity>();
  const pages = new Map<string, BlockEntity[]>();
  const refs = indexBlocks(tree);
  let loads = 0;
  let frontier: BlockEntity[][] = [tree];
  for (let round = 0; round < 2 && frontier.length; round++) {
    const next: BlockEntity[][] = [];
    for (const t of frontier) {
      const e = findEmbeds(t);
      const raw = JSON.stringify(t);
      const uuids = new Set([...e.blocks, ...[...raw.matchAll(REF)].map((m) => m[1])]);
      for (const id of uuids) {
        if (loads >= MAX_LOADS || blocks.has(id) || !opts.loadBlock) continue;
        loads++;
        const b = await opts.loadBlock(id).catch(() => null);
        if (b) {
          blocks.set(id, b);
          for (const [k, v] of indexBlocks([b])) if (!refs.has(k)) refs.set(k, v);
          next.push([b]);
        }
      }
      for (const name of e.pages) {
        if (loads >= MAX_LOADS || pages.has(name) || !opts.loadPage) continue;
        loads++;
        const p = await opts.loadPage(name).catch(() => null);
        if (p) {
          pages.set(name, p);
          for (const [k, v] of indexBlocks(p)) if (!refs.has(k)) refs.set(k, v);
          next.push(p);
        }
      }
    }
    frontier = next;
  }
  return { blocks, pages, refs };
}

/** Block tree of one page -> .docx bytes. */
export async function exportPageToDocx(tree: BlockEntity[], opts: PageExportOptions): Promise<Uint8Array> {
  const s = opts.settings ?? DEFAULT_SETTINGS;
  const gate = opts.gate ?? new FreeGate();
  const { blocks, pages, refs } = await loadTargets(tree, opts);
  const md = blocksToMarkdown(tree, {
    title: opts.title,
    titleHeading: s.titleHeading,
    mode: s.outlineMode,
    headingDepth: s.headingDepth,
    pageProperties: s.pageProperties,
    resolveRef: (id) => refs.get(id),
    resolveBlock: (id) => blocks.get(id),
    resolvePage: (n) => pages.get(n),
  });
  return exportToDocx(md, {
    title: opts.title,
    resolveImage: opts.resolveImage,
    gate,
    toc: s.toc,
    page: { size: s.pageSize },
    pro: { header: s.header || undefined, footer: s.footer || undefined, pageNumbers: s.pageNumbers },
  });
}

export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").replace(/^\.+/, "").slice(0, 120) || "page";
}

export interface BatchOptions extends Omit<PageExportOptions, "title"> {
  /** Load a page's block tree by name. */
  loadTree: (name: string) => Promise<BlockEntity[] | null>;
}

export const MAX_BATCH_PAGES = 200;

/** Pro: several pages -> one .zip with one .docx each. Failed pages are reported, not fatal. */
export async function exportBatch(
  names: string[],
  opts: BatchOptions,
): Promise<{ zip: Uint8Array; exported: string[]; failed: { name: string; reason: string }[] }> {
  if (!(opts.gate ?? new FreeGate()).has("batch")) throw new ProLockedError("Batch export");
  const list = [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, MAX_BATCH_PAGES);
  if (!list.length) throw new Error("No pages to export.");
  const zip = new JSZip();
  const used = new Set<string>();
  const exported: string[] = [];
  const failed: { name: string; reason: string }[] = [];
  for (const name of list) {
    try {
      const tree = await opts.loadTree(name);
      if (!tree) throw new Error("page not found");
      const bytes = await exportPageToDocx(tree, { ...opts, title: name });
      let file = safeFileName(name);
      for (let i = 2; used.has(file.toLowerCase()); i++) file = `${safeFileName(name)} (${i})`;
      used.add(file.toLowerCase());
      zip.file(file + ".docx", bytes);
      exported.push(name);
    } catch (e) {
      failed.push({ name, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  if (!exported.length) throw new Error("None of the pages could be exported: " + failed.map((f) => `${f.name} (${f.reason})`).join("; "));
  return { zip: await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }), exported, failed };
}

/** Page names for a batch setting: a comma/newline list, or a namespace ("Projects/") expanded from all page names. */
export function expandBatchPages(setting: string, allPages: string[]): string[] {
  const out: string[] = [];
  for (const raw of setting.split(/[,\n]/)) {
    const t = raw.trim();
    if (!t) continue;
    if (t.endsWith("/")) {
      const p = t.toLowerCase();
      out.push(...allPages.filter((n) => n.toLowerCase().startsWith(p)));
    } else out.push(t);
  }
  return out;
}
