import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type { BlockEntity } from "../src/blocks";
import { exportBatch, exportPageToDocx, expandBatchPages } from "../src/export";
import { verifyLicense, applyLicenseResult, type HttpPost } from "../src/license";
import { blocksToMarkdown } from "../src/outline";
import {
  DEFAULT_SETTINGS,
  LogseqProGate,
  ProLockedError,
  applyPreset,
  normalizeSettings,
  savePreset,
} from "../src/settings";
import { FreeGate } from "../src/docx/pro";

const U = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const tree: BlockEntity[] = [
  { uuid: U(1), content: "title:: Plan\nauthor:: [[Ann]]\nid:: " + U(1) },
  {
    uuid: U(2), content: "Chapter one",
    children: [
      { uuid: U(3), content: "Section A", children: [
        { uuid: U(4), content: "Detail level three", children: [{ uuid: U(5), content: "Deep leaf" }] },
      ] },
      { uuid: U(6), content: "A plain leaf" },
    ],
  },
];

const docXml = async (b: Uint8Array) => (await JSZip.loadAsync(b)).file("word/document.xml")!.async("string");
const files = async (b: Uint8Array) => Object.keys((await JSZip.loadAsync(b)).files);

describe("outline mapping", () => {
  it("headings mode: blocks with children become headings down to the depth, deeper ones lists", () => {
    const md = blocksToMarkdown(tree, { mode: "headings", headingDepth: 2, title: "Plan", titleHeading: true });
    expect(md).toContain("# Plan");
    expect(md).toContain("## Chapter one");
    expect(md).toContain("### Section A");
    expect(md).not.toContain("#### ");
    expect(md).toMatch(/\n- Detail level three\n {2}- Deep leaf/);
    expect(md).toMatch(/\n\nA plain leaf\n/); // leaf above the cut-off is a paragraph
  });
  it("headingDepth 1 only headlines the top level", () => {
    const md = blocksToMarkdown(tree, { mode: "headings", headingDepth: 1 });
    expect(md).toContain("# Chapter one");
    expect(md).toContain("- Section A");
  });
  it("lists mode: everything is nested list items", () => {
    const md = blocksToMarkdown(tree, { mode: "lists" });
    expect(md).not.toMatch(/^#/m);
    expect(md).toContain("- Chapter one\n  - Section A\n    - Detail level three\n      - Deep leaf\n  - A plain leaf");
  });
  it("page properties are dropped by default and kept as a table on request", () => {
    expect(blocksToMarkdown(tree, { mode: "lists" })).not.toMatch(/author|Ann|::/);
    const kept = blocksToMarkdown(tree, { mode: "lists", pageProperties: "keep" });
    expect(kept).toContain("| author | Ann |");
    expect(kept).not.toContain("| id |");
    expect(kept).not.toContain("::");
  });
  it("cleans Logseq syntax", () => {
    const md = blocksToMarkdown(
      [{ content: "TODO [#A] See [[Roadmap]] and [label]([[Other Page]]) #[[deep work]] #tag ^^key^^" }, { content: "DONE shipped" }],
      { mode: "lists" },
    );
    expect(md).toContain("- [ ] See Roadmap and label #deep work #tag ==key==");
    expect(md).toContain("- [x] shipped");
    expect(md).not.toMatch(/\[\[|\[#A\]|TODO/);
  });
});

describe("block refs and embeds", () => {
  const other: BlockEntity = { uuid: U(20), content: "Embedded parent", children: [{ uuid: U(21), content: "Embedded child" }] };
  const page: BlockEntity[] = [{ uuid: U(30), content: "From the other page" }];
  const host: BlockEntity[] = [
    { uuid: U(10), content: "Intro with ref ((" + U(40) + "))" },
    { uuid: U(11), content: "{{embed ((" + U(20) + "))}}" },
    { uuid: U(12), content: "{{embed [[Other Page]]}}" },
  ];
  const loaders = {
    loadBlock: async (id: string) => (id === U(20) ? other : id === U(40) ? { uuid: U(40), content: "Remote block text" } : null),
    loadPage: async (n: string) => (n === "Other Page" ? page : null),
  };
  it("resolves refs and embeds to text in the .docx", async () => {
    const xml = await docXml(await exportPageToDocx(host, { title: "Host", ...loaders }));
    for (const t of ["Remote block text", "Embedded parent", "Embedded child", "From the other page"]) expect(xml).toContain(t);
    expect(xml).not.toMatch(/\(\(|\{\{/);
  });
  it("survives a self-embedding page and unknown targets", async () => {
    const cyc: BlockEntity[] = [{ uuid: U(50), content: "{{embed [[Loop]]}}" }, { uuid: U(51), content: "{{embed ((" + U(99) + "))}}" }, { content: "end" }];
    const bytes = await exportPageToDocx(cyc, { title: "Loop", loadPage: async () => cyc, loadBlock: async () => null });
    expect(await docXml(bytes)).toContain("end");
  });
});

describe("free tier is fully useful; Pro is locked without a key", () => {
  const s = normalizeSettings({ header: "Confidential", footer: "Draft", pageNumbers: true, toc: true });
  const table: BlockEntity[] = [
    { content: "Heading block", children: [{ content: "| A | B |\n| - | - |\n| 1 | 2 |" }, { content: "![pic](../assets/p.png)" }] },
  ];
  it("free export keeps headings, tables and links but has no header/footer/page numbers", async () => {
    const bytes = await exportPageToDocx([...tree, ...table, { content: "[site](https://logseq.com/)" }], { title: "T", settings: s, gate: new FreeGate() });
    const f = await files(bytes);
    expect(f.some((n) => /word\/(header|footer)\d*\.xml/.test(n))).toBe(false);
    const xml = await docXml(bytes);
    expect(xml).toContain("<w:tbl>");
    expect(xml).toContain('w:val="Heading2"');
    expect(xml).toContain("TOC");
  });
  it("a LogseqProGate(false) behaves like free", async () => {
    const bytes = await exportPageToDocx(tree, { title: "T", settings: s, gate: new LogseqProGate(false) });
    expect((await files(bytes)).some((n) => /word\/footer/.test(n))).toBe(false);
  });
  it("unlocked: header, footer and page numbers appear", async () => {
    const bytes = await exportPageToDocx(tree, { title: "T", settings: s, gate: new LogseqProGate(true) });
    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files);
    const header = names.find((n) => /word\/header\d*\.xml/.test(n))!;
    const footer = names.find((n) => /word\/footer\d*\.xml/.test(n))!;
    expect(await zip.file(header)!.async("string")).toContain("Confidential");
    const fx = await zip.file(footer)!.async("string");
    expect(fx).toContain("Draft");
    expect(fx).toContain("PAGE");
  });
});

describe("licence check (mocked Gumroad)", () => {
  const post = (body: unknown, status = 200): HttpPost => async () => ({ status, json: async () => body });
  it("valid test key unlocks, invalid and refunded do not", async () => {
    const ok = await verifyLicense("TEST-KEY-1234-ABCD", post({ success: true, purchase: {} }), "prod_test");
    expect(ok.status).toBe("valid");
    expect(applyLicenseResult({ proActive: false, licenseKey: "" }, ok, "TEST-KEY-1234-ABCD").proActive).toBe(true);
    const bad = await verifyLicense("NOT-A-REAL-KEY-1", post({ success: false }, 404), "prod_test");
    expect(bad.status).toBe("invalid");
    const refunded = await verifyLicense("TEST-KEY-1234-ABCD", post({ success: true, purchase: { refunded: true } }), "prod_test");
    expect(refunded.status).toBe("refunded");
    expect(applyLicenseResult({ proActive: true, licenseKey: "x" }, refunded, "TEST-KEY-1234-ABCD").proActive).toBe(false);
  });
  it("makes no call when the product id is not configured, and an offline error keeps Pro", async () => {
    let calls = 0;
    const counting: HttpPost = async () => { calls++; return { status: 200, json: async () => ({}) }; };
    expect((await verifyLicense("TEST-KEY-1234-ABCD", counting, "")).status).toBe("unconfigured");
    expect(calls).toBe(0);
    const down = await verifyLicense("TEST-KEY-1234-ABCD", async () => { throw new Error("offline"); }, "prod_test");
    expect(down.status).toBe("error");
    expect(applyLicenseResult({ proActive: true, licenseKey: "k" }, down, "k").proActive).toBe(true);
  });
  it("sends only product id, key and increment_uses_count=false", async () => {
    let body = "";
    await verifyLicense("TEST-KEY-1234-ABCD", async (_u, init) => { body = init.body; return { status: 200, json: async () => ({ success: true, purchase: {} }) }; }, "prod_test");
    expect([...new URLSearchParams(body).keys()].sort()).toEqual(["increment_uses_count", "license_key", "product_id"]);
  });
});

describe("saved presets and batch (Pro)", () => {
  it("presets are locked without a key and round-trip with one", () => {
    const cur = normalizeSettings({ outlineMode: "lists", headingDepth: 5, header: "H" });
    expect(() => savePreset({}, "mine", cur, new LogseqProGate(false))).toThrow(ProLockedError);
    const store = savePreset({}, "mine", cur, new LogseqProGate(true));
    expect(() => applyPreset(store, "mine", DEFAULT_SETTINGS, new LogseqProGate(false))).toThrow(ProLockedError);
    const back = applyPreset(store, "mine", DEFAULT_SETTINGS, new LogseqProGate(true));
    expect(back.outlineMode).toBe("lists");
    expect(back.headingDepth).toBe(5);
    expect(back.header).toBe("H");
    expect(() => applyPreset(store, "nope", DEFAULT_SETTINGS, new LogseqProGate(true))).toThrow(/No saved preset/);
    expect(() => savePreset({}, "bad/name", cur, new LogseqProGate(true))).toThrow();
  });
  it("normalizeSettings repairs junk", () => {
    expect(normalizeSettings({ headingDepth: "9", outlineMode: "x", pageSize: 3 } as never)).toMatchObject({ headingDepth: 3, outlineMode: "headings", pageSize: "A4" });
    expect(normalizeSettings({ headingDepth: "2" } as never).headingDepth).toBe(2);
  });
  const pages: Record<string, BlockEntity[]> = {
    "Projects/Alpha": [{ content: "Alpha body UNIQUE_ALPHA" }],
    "Projects/Beta": [{ content: "Beta body UNIQUE_BETA" }],
  };
  const loadTree = async (n: string) => pages[n] ?? null;
  it("batch is locked without a key", async () => {
    await expect(exportBatch(Object.keys(pages), { loadTree })).rejects.toThrow(ProLockedError);
    await expect(exportBatch(Object.keys(pages), { loadTree, gate: new LogseqProGate(false) })).rejects.toThrow(/Pro feature/);
  });
  it("exports 2 pages (namespace) into one zip, one .docx each, and reports a missing page", async () => {
    const names = expandBatchPages("Projects/, Missing Page", [...Object.keys(pages), "Other/Page"]);
    expect(names).toEqual(["Projects/Alpha", "Projects/Beta", "Missing Page"]);
    const r = await exportBatch(names, { loadTree, gate: new LogseqProGate(true) });
    expect(r.exported).toEqual(["Projects/Alpha", "Projects/Beta"]);
    expect(r.failed).toEqual([{ name: "Missing Page", reason: "page not found" }]);
    const zip = await JSZip.loadAsync(r.zip);
    expect(Object.keys(zip.files).sort()).toEqual(["Projects_Alpha.docx", "Projects_Beta.docx"]);
    const a = await JSZip.loadAsync(await zip.file("Projects_Alpha.docx")!.async("uint8array"));
    expect(await a.file("word/document.xml")!.async("string")).toContain("UNIQUE_ALPHA");
  });
});
