import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const sourceRoot = path.resolve("src");
const extensions = new Set([".css", ".js", ".jsx", ".ts", ".tsx"]);
const tokenSourceFiles = new Set([
  path.normalize("index.css"),
  path.normalize("lib/design-tokens.ts"),
]);

const directNeutralClass = /(?:text|bg|border|ring|divide|outline|placeholder|from|via|to)-(?:gray|slate|zinc|neutral|stone|black|white)(?:-[0-9]{2,3})?(?:\/[0-9]{1,3})?/g;
const legacyNeutralHex = /#(?:000(?:000)?|111827|181816|242424|282822|3D3D3A|3F3F3F|5A5A50|63635E|6B7280|6F6F6F|74746E|777770|777777|7A7979|898982|8B8B8B|989898|A3A39E|A5A5A0|ADADAD|AFAEA2|B7B7B7|B9B9B4|CFCFCD|CFCFCF|D5D5D1|DBDBDB|DDDCD8|E5E7EB|E6E6E2|E6E6E6|E8E8E8|EAEAEA|EDEDED|F0F0EE|F0F0F0|F1F1F1|F5F5F3|F5F5F5|FAFAF8|FBFBFB|FCFCFC|FFF(?:FFF)?)(?:[0-9A-F]{2})?\b/gi;

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(target);
    return extensions.has(path.extname(entry.name)) ? [target] : [];
  }));
  return nested.flat();
}

const violations = [];

for (const file of await collectFiles(sourceRoot)) {
  const relativeFile = path.relative(sourceRoot, file);
  const source = await readFile(file, "utf8");
  const lines = source.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    directNeutralClass.lastIndex = 0;
    const directMatches = [...line.matchAll(directNeutralClass)];
    for (const match of directMatches) {
      violations.push(`${relativeFile}:${index + 1} uses ${match[0]}`);
    }

    if (!tokenSourceFiles.has(relativeFile)) {
      legacyNeutralHex.lastIndex = 0;
      const hexMatches = [...line.matchAll(legacyNeutralHex)];
      for (const match of hexMatches) {
        violations.push(`${relativeFile}:${index + 1} uses ${match[0]}`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error("Neutral color token violations:\n" + violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Neutral color token check passed.");
}
