import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const sourceRoot = path.resolve("src");
const modalRoot = path.join(sourceRoot, "components/modals");
const extensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
const contentComponents = [
  "DialogContent",
  "AlertDialogContent",
  "SheetContent",
  "PopoverContent",
  "DropdownMenuContent",
  "SelectContent",
];
const roundedUtility = /(^|[\s"'`])((?:[^\s"'`]*:)?rounded(?:-[^\s"'`]*)?)(?=$|[\s"'`])/gm;
const unmarkedContent = new RegExp(
  `<(${contentComponents.join("|")})\\b(?! data-square-modal="")`,
  "g",
);
const radiusProperty = /\bborderRadius\s*:|\bborder-radius\s*:/g;

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

for (const file of await collectFiles(modalRoot)) {
  const relativeFile = path.relative(sourceRoot, file);
  const source = await readFile(file, "utf8");
  const lines = source.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    roundedUtility.lastIndex = 0;
    for (const match of line.matchAll(roundedUtility)) {
      const utility = match[2];
      const base = utility.slice(utility.lastIndexOf(":") + 1);
      if (base !== "rounded-none") {
        violations.push(`${relativeFile}:${index + 1} uses ${utility}`);
      }
    }

    radiusProperty.lastIndex = 0;
    if (radiusProperty.test(line)) {
      violations.push(`${relativeFile}:${index + 1} declares border radius`);
    }

    unmarkedContent.lastIndex = 0;
    for (const match of line.matchAll(unmarkedContent)) {
      violations.push(`${relativeFile}:${index + 1} leaves ${match[1]} outside the modal scope`);
    }
  }
}

for (const customModal of ["RequisicionHistoryModal.tsx", "ReviewRequisicionModal.tsx"]) {
  const source = await readFile(path.join(modalRoot, customModal), "utf8");
  if (!source.includes('data-square-modal=""')) {
    violations.push(`components/modals/${customModal} is missing the modal scope marker`);
  }
}

const buttonComponent = await readFile(path.join(sourceRoot, "components/ui/button.tsx"), "utf8");
roundedUtility.lastIndex = 0;
for (const match of buttonComponent.matchAll(roundedUtility)) {
  const utility = match[2];
  const base = utility.slice(utility.lastIndexOf(":") + 1);
  if (base !== "rounded-none") {
    violations.push(`components/ui/button.tsx uses ${utility}`);
  }
}
if (!buttonComponent.includes('cn(buttonVariants({ variant, size, className }), "rounded-none")')) {
  violations.push("components/ui/button.tsx does not enforce rounded-none after custom classes");
}

const globalStyles = await readFile(path.join(sourceRoot, "index.css"), "utf8");
if (!globalStyles.includes(':where(button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"])')) {
  violations.push("index.css is missing the native button radius selector");
}
if (!globalStyles.includes("[data-square-modal] *::after")) {
  violations.push("index.css is missing the scoped modal radius rule");
}

if (violations.length > 0) {
  console.error("Radius scope violations:\n" + violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Button and modal radius check passed.");
}
