import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { exportPageToDocx } from "../src/export";

const PNG = Uint8Array.from(
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
);

const strip = (s: string) => s.replace(/^(\.\.\/)+/, "");

async function run(lines: string[], known: string[]) {
  const seen: string[] = [];
  const bytes = await exportPageToDocx(
    lines.map((content) => ({ content })),
    { title: "T", resolveImage: async (s) => (seen.push(s), known.includes(s.replace(/^(\.\.\/)+/, "")) ? Uint8Array.from([...PNG, seen.length]) : null) },
  );
  const zip = await JSZip.loadAsync(bytes);
  return { seen, zip, xml: await zip.file("word/document.xml")!.async("string") };
}

describe("image paths as Logseq writes them", () => {
  it("handles pasted-style, space and unicode names", async () => {
    const names = ["../assets/image_1697040000000_0.png", "../assets/my photo 1.jpg", "../assets/Zoë diagram.png", "../assets/Zo%C3%AB%20d.png"];
    const { seen, zip } = await run(names.map((n, i) => `![a${i}](${n})`), names.map(strip));
    expect(seen.map(strip)).toEqual(names.map(strip));
    expect(Object.keys(zip.files).filter((f) => f.startsWith("word/media/") && !f.endsWith("/")).length).toBe(4);
  });
  it("handles angle brackets, titles, width suffix and parentheses in names", async () => {
    const names = ["../assets/a b.png", "../assets/shot (1).png", "../assets/c d.png"];
    const lines = ["![x](<../assets/a b.png>)", "![y](../assets/shot (1).png)", '![z|300](../assets/c d.png "title")'];
    const { seen, zip } = await run(lines, names.map(strip));
    expect(seen.map(strip)).toEqual(names.map(strip));
    expect(Object.keys(zip.files).filter((f) => f.startsWith("word/media/") && !f.endsWith("/")).length).toBe(3);
  });
  it("svg becomes a visible note, not a crash", async () => {
    const seen: string[] = [];
    const bytes = await exportPageToDocx([{ content: "![logo](../assets/logo.svg)" }], {
      title: "T",
      resolveImage: async (s) => (seen.push(s), new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>")),
    });
    const xml = await (await JSZip.loadAsync(bytes)).file("word/document.xml")!.async("string");
    expect(xml).toContain("unsupported image type: logo");
  });
  it("does not swallow text after an image on the same line", async () => {
    const { xml } = await run(["![p](../assets/p.png) and (paren) text"], ["../assets/p.png"]);
    expect(xml).toContain("and (paren) text");
  });
});
