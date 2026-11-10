// Translation coverage check for the React client (run: npm run i18n:check).
//
// Keys are the English source strings; French lives in src/i18n/locales/fr/*.ts. `tsc -b` already
// rejects t("...") keys missing from the French dictionary. This script adds what the type system
// cannot see:
//   1. user-facing text that never went through t(): JSX text and text-bearing JSX attributes
//      (aria-label, title, placeholder, ...),
//   2. duplicate keys across the French dictionary files,
//   3. plural keys missing their "_one"/"_other" forms in French or English,
//   4. French keys no longer used anywhere (reported, not fatal).
// Exit code 1 when 1-3 find anything.
import ts from "typescript";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "src");
const LOCALES = join(SRC, "i18n", "locales");
const FR_DIR = join(LOCALES, "fr");

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const TEXT_ATTRIBUTES = new Set([
  "aria-label", "aria-description", "aria-placeholder", "aria-roledescription", "aria-valuetext",
  "title", "placeholder", "alt", "label", "message", "confirmLabel", "hint", "action", "heading", "emptyLabel", "subtitle",
]);
// Brand names, keyboard hints and file-type badges are the same in every language.
const ALLOWED_TEXT = new Set(["DocuMind", "Docu", "Mind", "DocuMind AI", "Ctrl K", "Northwind Ltd.", "AI"]);
const HAS_WORD = /\p{L}{2,}/u;

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return full === LOCALES ? [] : walk(full);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts") ? [full] : [];
  });

const parse = (file) =>
  ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

const position = (source, node) => {
  const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
  return `${relative(ROOT, source.fileName).replaceAll("\\", "/")}:${line + 1}`;
};

/** Property names of the first object literal assigned to a const in a dictionary file. */
function dictionaryKeys(file) {
  const source = parse(file);
  const keys = [];
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      for (const prop of node.initializer.properties) {
        if (ts.isPropertyAssignment(prop) && (ts.isStringLiteral(prop.name) || ts.isIdentifier(prop.name))) {
          keys.push({ key: prop.name.text, at: position(source, prop) });
        }
      }
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return keys;
}

const problems = { untranslated: [], duplicates: [], plurals: [], missing: [] };

// ---- dictionaries
const frEntries = readdirSync(FR_DIR)
  .filter((name) => name.endsWith(".ts") && name !== "index.ts")
  .flatMap((name) => dictionaryKeys(join(FR_DIR, name)));
const fr = new Map();
for (const entry of frEntries) {
  if (fr.has(entry.key)) problems.duplicates.push(`${entry.at}  "${entry.key}" (also at ${fr.get(entry.key)})`);
  else fr.set(entry.key, entry.at);
}
const en = new Set(dictionaryKeys(join(LOCALES, "en.ts")).map((entry) => entry.key));

const pluralBases = new Set([...fr.keys()].filter((key) => PLURAL_SUFFIX.test(key)).map((key) => key.replace(PLURAL_SUFFIX, "")));
for (const base of pluralBases) {
  for (const form of ["one", "other"]) {
    if (!fr.has(`${base}_${form}`)) problems.plurals.push(`fr is missing "${base}_${form}"`);
    if (!en.has(`${base}_${form}`)) problems.plurals.push(`en is missing "${base}_${form}"`);
  }
}
const hasKey = (key) => fr.has(key) || pluralBases.has(key);

// ---- source files
const used = new Set();
for (const file of walk(SRC)) {
  const source = parse(file);
  const visit = (node) => {
    // Any string literal equal to a key counts as a use (labels in config arrays are translated later).
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && hasKey(node.text)) used.add(node.text);

    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const isT = (ts.isIdentifier(callee) && callee.text === "t") || (ts.isPropertyAccessExpression(callee) && callee.name.text === "t");
      const [first] = node.arguments;
      if (isT && first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first)) && !hasKey(first.text)) {
        problems.missing.push(`${position(source, first)}  "${first.text}"`);
      }
    }

    if (ts.isJsxText(node)) {
      // Entities such as &middot; / &copy; are punctuation, not words.
      const text = node.text.replace(/&[a-z]+;|&#\d+;/gi, " ").replace(/\s+/g, " ").trim();
      if (text && HAS_WORD.test(text) && !ALLOWED_TEXT.has(text)) problems.untranslated.push(`${position(source, node)}  text: "${text}"`);
    }

    if (ts.isJsxAttribute(node) && node.initializer) {
      const name = node.name.getText(source);
      const init = node.initializer;
      const literal = ts.isStringLiteral(init)
        ? init
        : ts.isJsxExpression(init) && init.expression && (ts.isStringLiteral(init.expression) || ts.isNoSubstitutionTemplateLiteral(init.expression))
          ? init.expression
          : null;
      if (name === "i18nKey" && literal) {
        if (!hasKey(literal.text)) problems.missing.push(`${position(source, literal)}  <Trans i18nKey="${literal.text}">`);
        else used.add(literal.text);
      } else if (TEXT_ATTRIBUTES.has(name) && literal && HAS_WORD.test(literal.text) && !ALLOWED_TEXT.has(literal.text)) {
        problems.untranslated.push(`${position(source, literal)}  ${name}="${literal.text}"`);
      } else if (TEXT_ATTRIBUTES.has(name) && ts.isJsxExpression(init) && init.expression && ts.isTemplateExpression(init.expression)) {
        // Only the literal parts of a template are user-facing text; ${t(...)} parts are already translated.
        const template = init.expression;
        const literalText = [template.head.text, ...template.templateSpans.map((span) => span.literal.text)].join(" ");
        if (HAS_WORD.test(literalText)) {
          problems.untranslated.push(`${position(source, template)}  ${name}={\`${template.getText(source).slice(1, 60)}...\`}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

const unused = [...fr.keys()].filter((key) => !used.has(key) && !used.has(key.replace(PLURAL_SUFFIX, "")));

const report = (title, items) => {
  if (!items.length) return;
  console.log(`\n${title} (${items.length})`);
  for (const item of items) console.log(`  ${item}`);
};
report("Untranslated user-facing text", problems.untranslated);
report("t() keys missing from the French dictionary", problems.missing);
report("Duplicate French keys", problems.duplicates);
report("Incomplete plural forms", problems.plurals);
report("Unused French keys (warning)", unused.map((key) => `"${key}"  ${fr.get(key)}`));

const failures = problems.untranslated.length + problems.missing.length + problems.duplicates.length + problems.plurals.length;
console.log(`\ni18n: ${fr.size} French keys, ${failures} problem(s), ${unused.length} unused key(s).`);
process.exit(failures ? 1 : 0);
