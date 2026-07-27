import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceFiles = [
  "src/audiogram.js",
  "src/screening.js",
  "src/report.js",
];

function removeModuleSyntax(source) {
  return source
    .replace(/^import\s+[\s\S]*?\s+from\s+["'][^"']+["'];\s*$/gm, "")
    .replace(/\bexport\s+(?=(?:const|class|function)\b)/g, "");
}

const [page, logo, ...modules] = await Promise.all([
  readFile(join(root, "index.html"), "utf8"),
  readFile(join(root, "docs/logo.svg"), "utf8"),
  ...sourceFiles.map((file) => readFile(join(root, file), "utf8")),
]);

const bundle = modules.map(removeModuleSyntax).join("\n\n");
const moduleOpening =
  /<script type="module">\s*import\s*\{[\s\S]*?\}\s*from\s*["']\.\/src\/index\.js["'];/;

if (!moduleOpening.test(page)) {
  throw new Error("Could not find the demo module import in index.html.");
}

const logoData = `data:image/svg+xml,${encodeURIComponent(logo)}`;
const standalone = page
  .replace('src="./docs/logo.svg"', `src="${logoData}"`)
  .replace(moduleOpening, `<script type="module">\n${bundle}`);

if (
  standalone.includes('from "./src/') ||
  standalone.includes('src="./docs/logo.svg"')
) {
  throw new Error("Standalone output still contains local runtime references.");
}

const output = join(root, "dist/standalone.html");
await mkdir(dirname(output), { recursive: true });
await writeFile(output, standalone, "utf8");
console.log(`Built ${output}`);
