// Pro-forced export (gate forced ON, no licence call) of the Demo page tree: header, footer, page numbers; plus a 2-page batch zip.
// Run: npx vite-node e2e/pro-forced.ts   (writes e2e-out/pro-forced.docx, batch.zip)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { BlockEntity } from "../src/blocks";
import { exportBatch, exportPageToDocx } from "../src/export";
import { LogseqProGate, normalizeSettings } from "../src/settings";

const png = new Uint8Array(readFileSync("icon.png"));
const demo: BlockEntity[] = [
  { content: "Project kickoff", children: [
    { content: "Goals", children: [{ content: "Ship the first version of the report" }, { content: "Link to [[Research Notes]] for background" }] },
    { content: "Risks", children: [{ content: "TODO Confirm the scope with the team" }, { content: "DONE Book the review meeting" }] },
  ] },
  { content: "Status table", children: [{ content: "| Item | Owner |\n|---|---|\n| Export | Ann |\n| Review | Bob |" }] },
  { content: "![chart](../assets/pic.png)" },
];
const s = normalizeSettings({ header: "Demo Page - confidential", footer: "Exported with DOCX Export", pageNumbers: true });
const gate = new LogseqProGate(true);
mkdirSync("e2e-out", { recursive: true });
const docx = await exportPageToDocx(demo, { title: "Demo Page", settings: s, gate, resolveImage: async () => png });
writeFileSync("e2e-out/pro-forced.docx", docx);
const pages: Record<string, BlockEntity[]> = { "Demo/One": demo, "Demo/Two": [{ content: "Second page body" }] };
const r = await exportBatch(Object.keys(pages), { loadTree: async (n) => pages[n] ?? null, gate, settings: s, resolveImage: async () => png });
writeFileSync("e2e-out/batch.zip", r.zip);
console.log("pro-forced.docx", docx.length, "batch.zip", r.zip.length, "exported", r.exported.join(","), "failed", r.failed.length);
