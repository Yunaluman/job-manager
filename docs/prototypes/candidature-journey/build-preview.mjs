// Produce a portable preview with no runtime dependencies or external resources.
import { readFile, writeFile, mkdir } from "node:fs/promises";
const root = new URL("./", import.meta.url);
const html = await readFile(new URL("index.html", root), "utf8");
const css = await readFile(new URL("prototype.css", root), "utf8");
const fixtures = (
  await readFile(new URL("fixtures.mjs", root), "utf8")
).replaceAll("export const ", "const ");
let script = (await readFile(new URL("prototype.mjs", root), "utf8")).replace(
  /^import .*\n/,
  "",
);
const files = {};
for (const name of [
  "CV_Alex_Martin.pdf",
  "Lettre_Atelier_Numerique.pdf",
  "Lettre_Atelier_Numerique.docx",
]) {
  const bytes = await readFile(new URL(`samples/${name}`, root));
  const mime = name.endsWith(".pdf")
    ? "application/pdf"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  files[name] = `data:${mime};base64,${bytes.toString("base64")}`;
}
script = script.replace(
  "new URL(`samples/${file}`, import.meta.url).href",
  "sampleFiles[file]",
);
const output = new URL("../../../output/jobpilot-prototype.html", root);
await mkdir(new URL("./", output), { recursive: true });
await writeFile(
  output,
  html
    .replace(
      /<link\s+rel="stylesheet"\s+href="\.\/prototype.css"\s*\/?>/,
      `<style>${css}</style>`,
    )
    .replace(
      '<script type="module" src="./prototype.mjs"></script>',
      `<script type="module">${fixtures}\nconst sampleFiles = ${JSON.stringify(files)};\n${script}</script>`,
    ),
);
console.log(output.pathname);
