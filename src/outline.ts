import { clean, MAX_DEPTH, pageProperties, type BlockEntity, type BlocksOptions } from "./blocks";

/** How the Logseq outline maps onto Word. */
export interface OutlineOptions extends BlocksOptions {
  /** "headings": blocks with children become Word headings down to `headingDepth`; deeper blocks are nested lists. "lists": every block is a list item. */
  mode?: "headings" | "lists";
  /** Number of outline levels (1-6) that become headings in "headings" mode. Default 3. */
  headingDepth?: number;
  /** "drop" (default) removes page properties; "keep" writes them as a two-column table under the title. */
  pageProperties?: "drop" | "keep";
  /** Resolves an embedded block `{{embed ((uuid))}}`. */
  resolveBlock?: (uuid: string) => BlockEntity | undefined;
  /** Resolves an embedded page `{{embed [[Page]]}}`. */
  resolvePage?: (name: string) => BlockEntity[] | undefined;
}

const EMBED_BLOCK = /^\{\{embed\s+\(\(([0-9a-fA-F-]{36})\)\)\s*\}\}$/;
const EMBED_PAGE = /^\{\{embed\s+\[\[([^\]]+)\]\]\s*\}\}$/;
const MAX_EMBEDS = 200;

/** Embeds the tree asks for, so the caller can load them asynchronously before the (synchronous) conversion. */
export function findEmbeds(tree: BlockEntity[]): { blocks: string[]; pages: string[] } {
  const blocks = new Set<string>();
  const pages = new Set<string>();
  const walk = (bs: BlockEntity[], d: number) => {
    if (d > MAX_DEPTH) return;
    for (const b of bs) {
      const first = (b.content ?? "").split(/\r?\n/)[0].trim();
      const mb = first.match(EMBED_BLOCK);
      const mp = first.match(EMBED_PAGE);
      if (mb) blocks.add(mb[1]);
      if (mp) pages.add(mp[1]);
      if (b.children) walk(b.children, d + 1);
    }
  };
  walk(tree, 0);
  return { blocks: [...blocks], pages: [...pages] };
}

/** Convert a page's block tree to Markdown according to the outline settings. */
export function blocksToMarkdown(tree: BlockEntity[], opts: OutlineOptions = {}): string {
  const mode = opts.mode ?? "lists";
  const cutoff = Math.min(6, Math.max(1, Math.round(opts.headingDepth ?? 3)));
  const base = opts.titleHeading && opts.title ? 2 : 1; // level of a depth-0 outline heading
  const out: string[] = [];
  if (opts.titleHeading && opts.title) out.push(`# ${opts.title}`, "");

  if (opts.pageProperties === "keep") {
    const props = pageProperties(tree);
    if (props.length) {
      out.push("| Property | Value |", "| --- | --- |");
      for (const [k, v] of props) out.push(`| ${k.replace(/\|/g, "/")} | ${v.replace(/\|/g, "/")} |`);
      out.push("");
    }
  }

  let embeds = 0;
  const active = new Set<string>();
  const walk = (blocks: BlockEntity[], abs: number, listDepth: number): void => {
    if (abs > MAX_DEPTH) return;
    for (const b of blocks) {
      const first = (b.content ?? "").split(/\r?\n/)[0].trim();
      const mb = first.match(EMBED_BLOCK);
      const mp = first.match(EMBED_PAGE);
      if (mb || mp) {
        const key = mb ? "b:" + mb[1].toLowerCase() : "p:" + mp![1].toLowerCase();
        if (!active.has(key) && embeds < MAX_EMBEDS) {
          embeds++;
          const target = mb ? opts.resolveBlock?.(mb[1]) : opts.resolvePage?.(mp![1]);
          if (target) {
            active.add(key);
            walk(Array.isArray(target) ? target : [target], abs, listDepth);
            active.delete(key);
          }
        }
        if (b.children?.length) walk(b.children, abs + 1, listDepth + 1);
        continue;
      }
      const { lines, heading } = clean(b.content ?? "", b.properties, opts);
      const hasKids = !!b.children?.length;
      let childAbs = abs + 1;
      let childList = listDepth + 1;
      if (lines.length) {
        const isTable = /^\s*\|/.test(lines[0]);
        const hasFence = lines.some((l) => /^\s*```/.test(l));
        let level = heading;
        if (!level && mode === "headings" && abs < cutoff && hasKids && !isTable && !hasFence) level = Math.min(6, abs + base);
        if (level) {
          out.push("", `${"#".repeat(level)} ${lines[0]}`, "");
          for (const l of lines.slice(1)) out.push(l);
          childList = 0;
        } else if (isTable || hasFence) {
          out.push("", ...lines, "");
          childList = listDepth;
        } else if (mode === "headings" && abs < cutoff) {
          out.push("", ...lines.map((l) => l.trim()), "");
          childList = 0;
        } else {
          const pad = "  ".repeat(listDepth);
          out.push(`${pad}- ${lines[0]}`);
          for (const l of lines.slice(1)) out.push(`${pad}  ${l.trim()}`);
        }
      }
      if (hasKids) walk(b.children!, childAbs, childList);
    }
  };
  walk(tree, 0, 0);
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
