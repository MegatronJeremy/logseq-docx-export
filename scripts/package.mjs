// Builds <id>.zip the way the Logseq marketplace template's publish.yml does:
// one top-level folder holding dist/, package.json, icon, README, LICENSE, notices.
// Run after `npm run build`. Output: release/<id>.zip
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const id = pkg.name;
const files = ["package.json", "icon.png", "README.md", "LICENSE", "THIRD-PARTY-NOTICES.md"];
if (!existsSync("dist/index.html")) throw new Error("dist/index.html missing: run npm run build first");
const zip = new JSZip();
const date = new Date("2026-01-01T00:00:00Z"); // fixed, so the zip is reproducible
const add = (path) => zip.file(`${id}/${path}`, readFileSync(path), { date });
for (const f of files) add(f);
const walk = (d) => readdirSync(d).sort().forEach((n) => {
  const p = join(d, n);
  statSync(p).isDirectory() ? walk(p) : add(p);
});
walk("dist");
mkdirSync("release", { recursive: true });
const out = `release/${id}.zip`;
writeFileSync(out, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
console.log("wrote", out);
for (const n of Object.keys(zip.files).sort()) console.log("  " + n);
