import { readFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { type BlockEntity } from "../src/blocks";
import { blocksToMarkdown } from "../src/outline";
import { exportPageToDocx } from "../src/export";

const PNG = Uint8Array.from(
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
);
const load = (n: string) => JSON.parse(readFileSync(join(__dirname, "fixtures", n), "utf8")) as BlockEntity[];

async function render(name: string, title: string, images: string[] = []) {
  const seen: string[] = [];
  const bytes = await exportPageToDocx(load(name), {
    title,
    resolveImage: async (src) => {
      seen.push(src);
      return images.includes(src) ? PNG : null;
    },
  });
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file("word/document.xml")!.async("string");
  return { bytes, zip, xml, seen };
}

function wellFormed(xml: string) {
  // Tag balance check without a DOM: every <w:x> opened is closed or self-closed.
  const stack: string[] = [];
  for (const m of xml.matchAll(/<(\/?)([\w:.-]+)[^>]*?(\/?)>/g)) {
    if (m[2].startsWith("?") || m[3] === "/") continue;
    if (m[1] === "/") expect(stack.pop()).toBe(m[2]);
    else stack.push(m[2]);
  }
  expect(stack).toEqual([]);
}

describe("blocksToMarkdown", () => {
  it("drops properties, scheduling and block-ref syntax, keeps nesting", () => {
    const md = blocksToMarkdown(load("page-outline.json"), { resolveRef: () => "REF" });
    expect(md).not.toMatch(/::|SCHEDULED|collapsed|\(\(/);
    expect(md).toContain("# Project Plan");
    expect(md).toContain("- Goals for Q4");
    expect(md).toContain("  - Ship the OUTLINE_LEAF_MARKER beta");
    expect(md).toContain("    - Collect feedback");
    expect(md).toContain("- [ ] Write release notes");
    expect(md).toContain("- [x] Draft outline");
    expect(md).toContain("#deep work");
  });
});

describe("page 1: nested outline + link + block ref", () => {
  it("is a valid .docx with headings, list numbering and text", async () => {
    const { zip, xml } = await render("page-outline.json", "Project Plan");
    expect(zip.file("[Content_Types].xml")).toBeTruthy();
    expect(zip.file("word/document.xml")).toBeTruthy();
    wellFormed(xml);
    expect(xml).toContain("Project Plan");
    expect(xml).toContain('w:val="Heading1"');
    expect(xml).toContain("OUTLINE_LEAF_MARKER");
    expect(xml).toContain("Collect feedback");
    expect(xml).toContain("Write release notes");
    expect(xml).toContain("w:numPr");
    // the ((uuid)) reference is replaced by the referenced block's text
    expect(xml.match(/OUTLINE_LEAF_MARKER/g)!.length).toBeGreaterThanOrEqual(2);
    // external link becomes a hyperlink relationship
    const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
    expect(rels).toContain("https://logseq.com/");
  });
});

describe("page 2: table + image ref", () => {
  it("renders a Word table and embeds the image from the assets path", async () => {
    const { zip, xml, seen } = await render("page-table-image.json", "Results", ["assets/pixel.png"]);
    wellFormed(xml);
    expect(xml).toContain("<w:tbl>");
    expect(xml).toContain("Apple");
    expect(xml).toContain("Pear");
    expect(xml).toContain("TABLE_END_MARKER");
    expect(seen).toContain("assets/pixel.png");
    expect(Object.keys(zip.files).some((f) => f.startsWith("word/media/"))).toBe(true);
    expect(xml).toContain("<w:drawing>");
  });

  it("falls back to alt text when the image cannot be read", async () => {
    const { xml, zip } = await render("page-table-image.json", "Results", []);
    wellFormed(xml);
    expect(Object.keys(zip.files).some((f) => f.startsWith("word/media/"))).toBe(false);
    expect(xml).toContain("pixel");
  });
});

describe("page 3: code, quote, embed macro, math", () => {
  it("renders code and quote text and drops the embed macro", async () => {
    const { xml } = await render("page-code-quote.json", "Snippet page");
    wellFormed(xml);
    expect(xml).toContain("const answer = 42;");
    expect(xml).toContain("CODE_PAGE_MARKER");
    expect(xml).not.toContain("{{embed");
    expect(xml).toContain('w:val="Heading3"');
  });

  it("handles an empty page", async () => {
    const bytes = await exportPageToDocx([], { title: "Empty" });
    const zip = await JSZip.loadAsync(bytes);
    expect(zip.file("word/document.xml")).toBeTruthy();
  });
});
