/**
 * Logseq block tree -> Markdown that the DXS engine (src/docx) understands.
 * Input has the shape of logseq.Editor.getPageBlocksTree(); only the fields used here are typed.
 */
export interface BlockEntity {
  uuid?: string;
  content?: string;
  properties?: Record<string, unknown>;
  children?: BlockEntity[];
}

export interface BlocksOptions {
  /** Resolve ((uuid)) block references to their text. Unresolved references are dropped. */
  resolveRef?: (uuid: string) => string | undefined;
  /** Page title: emitted as a level-1 heading when `titleHeading` is true. */
  title?: string;
  titleHeading?: boolean;
}

export const PROP_LINE = /^[A-Za-z0-9_-]+:: ?.*$/;
const MARKER = /^(TODO|DOING|NOW|LATER|WAIT|WAITING|IN-PROGRESS)\s+/;
export const MAX_DEPTH = 40;

export interface Cleaned {
  lines: string[];
  heading?: number;
}

/** Strip Logseq-only syntax from one block's raw content. */
export function clean(content: string, props: Record<string, unknown> | undefined, opts: BlocksOptions): Cleaned {
  const out: string[] = [];
  let inLog = false;
  let inFence = false;
  for (const raw of content.split(/\r?\n/)) {
    if (/^\s*```/.test(raw)) inFence = !inFence;
    if (!inFence) {
      if (/^\s*:LOGBOOK:\s*$/.test(raw)) {
        inLog = true;
        continue;
      }
      if (inLog) {
        if (/^\s*:END:\s*$/.test(raw)) inLog = false;
        continue;
      }
      if (PROP_LINE.test(raw.trim()) || /^\s*(SCHEDULED|DEADLINE):/.test(raw)) continue;
    }
    out.push(raw);
  }
  while (out.length && out[0].trim() === "") out.shift();
  while (out.length && out[out.length - 1].trim() === "") out.pop();

  let heading: number | undefined;
  if (out.length) {
    const h = out[0].match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      heading = h[1].length;
      out[0] = h[2];
    } else if (props && props.heading !== undefined && props.heading !== false) {
      const n = Number(props.heading);
      heading = n >= 1 && n <= 6 ? n : 2;
    }
  }
  if (out.length) {
    out[0] = out[0]
      .replace(/^DONE\s+/, "[x] ")
      .replace(MARKER, "[ ] ")
      .replace(/^(CANCELED|CANCELLED)\s+(.*)$/, "~~$2~~")
      .replace(/^(\[[ x]\] )?\[#[ABC]\]\s*/, "$1");
  }
  const inline = (l: string) =>
    l
      .replace(/\(\(([0-9a-fA-F-]{36})\)\)/g, (_m, id: string) => opts.resolveRef?.(id) ?? "")
      .replace(/\{\{[^}]*\}\}/g, "") // macros and embeds
      .replace(/#\[\[([^\]]+)\]\]/g, "#$1")
      .replace(/\[([^\]]+)\]\(\[\[[^\]]+\]\]\)/g, "$1") // [label]([[Page]])
      .replace(/(?<!!)\[\[([^\]]+)\]\]/g, "$1") // [[Page]] -> Page
      .replace(/\^\^([^^\n]+)\^\^/g, "==$1==") // ^^highlight^^
      .replace(/(!\[[^\]]*\]\()\.\.\//g, "$1")
      .replace(/(!\[[^\]]*\]\([^)]*\))\{[^}]*\}/g, "$1"); // {:height 100 :width 200}
  let fence = false;
  const lines = out.map((l) => {
    if (/^\s*```/.test(l)) fence = !fence;
    return fence ? l : inline(l);
  });
  return { lines, heading };
}

/** Collect uuid -> cleaned first line, for ((uuid)) references within the exported page. */
export function indexBlocks(tree: BlockEntity[]): Map<string, string> {
  const m = new Map<string, string>();
  const walk = (bs: BlockEntity[], d: number) => {
    if (d > MAX_DEPTH) return;
    for (const b of bs) {
      if (b.uuid && b.content) {
        const l = clean(b.content, b.properties, {}).lines[0];
        if (l) m.set(b.uuid, l);
      }
      if (b.children) walk(b.children, d + 1);
    }
  };
  walk(tree, 0);
  return m;
}

/** uuid -> block entity for every block of a tree, so embeds and refs can find them. */
export function indexEntities(tree: BlockEntity[]): Map<string, BlockEntity> {
  const m = new Map<string, BlockEntity>();
  const walk = (bs: BlockEntity[], d: number) => {
    if (d > MAX_DEPTH) return;
    for (const b of bs) {
      if (b.uuid) m.set(b.uuid, b);
      if (b.children) walk(b.children, d + 1);
    }
  };
  walk(tree, 0);
  return m;
}

/** Page properties live in the first block when it holds only `key:: value` lines. Hidden/internal keys are skipped. */
const HIDDEN_PROPS = new Set(["id", "title", "collapsed", "filters", "heading", "icon", "public", "template", "template-including-parent"]);
export function pageProperties(tree: BlockEntity[]): [string, string][] {
  const first = tree[0];
  if (!first?.content) return [];
  const lines = first.content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length || !lines.every((l) => PROP_LINE.test(l))) return [];
  const out: [string, string][] = [];
  for (const l of lines) {
    const k = l.slice(0, l.indexOf("::")).trim();
    const v = l.slice(l.indexOf("::") + 2).trim().replace(/\[\[([^\]]+)\]\]/g, "$1");
    if (!HIDDEN_PROPS.has(k.toLowerCase()) && v) out.push([k, v]);
  }
  return out;
}
