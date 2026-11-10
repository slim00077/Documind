/**
 * Lists every user-facing message the API can send, straight from the source code:
 *   - the message of `new XxxException(...)` (string, template, constant, or `{ message }` object),
 *   - `message:` options of class-validator decorators in DTOs,
 *   - notification titles and messages (`notifications.notify({...})`, `events.notify/notifyMany(...)`).
 * Template literals come back as `{ template: "Some ${} text" }` so tests can build a sample.
 * Used by test/i18n.test.ts to prove each one has a French translation.
 */
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const SRC = path.join(__dirname, "..", "src");

function walk(dir) {
  return fs.readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) return walk(full);
    return name.endsWith(".ts") ? [full] : [];
  });
}

/** Resolves an expression to literal text pieces, following same-file `const X = "..."`. */
function textOf(node, constants) {
  if (!node) return [];
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [{ text: node.text }];
  if (ts.isTemplateExpression(node)) {
    const parts = [node.head.text, ...node.templateSpans.map((span) => "${}" + span.literal.text)];
    return [{ template: parts.join("") }];
  }
  if (ts.isParenthesizedExpression(node)) return textOf(node.expression, constants);
  if (ts.isConditionalExpression(node)) return [...textOf(node.whenTrue, constants), ...textOf(node.whenFalse, constants)];
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = textOf(node.left, constants);
    const right = textOf(node.right, constants);
    if (left.length === 1 && right.length === 1 && left[0].text !== undefined && right[0].text !== undefined) {
      return [{ text: left[0].text + right[0].text }];
    }
    return [];
  }
  if (ts.isIdentifier(node) && constants.has(node.text)) return textOf(constants.get(node.text), constants);
  if (ts.isObjectLiteralExpression(node)) {
    const message = node.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText() === "message");
    return message ? textOf(message.initializer, constants) : [];
  }
  return [];
}

function collectMessages() {
  const found = [];
  for (const file of walk(SRC)) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const constants = new Map();
    const rel = path.relative(path.join(__dirname, ".."), file).replaceAll("\\", "/");
    const add = (items, node) => {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      for (const item of items) found.push({ ...item, at: `${rel}:${line + 1}` });
    };

    const collectConstants = (node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) constants.set(node.name.text, node.initializer);
      ts.forEachChild(node, collectConstants);
    };
    collectConstants(source);

    const visit = (node) => {
      if (ts.isNewExpression(node) && /Exception$/.test(node.expression.getText(source)) && node.arguments?.length) {
        add(textOf(node.arguments[0], constants), node);
      }
      // class-validator: @IsX({ message: "..." }) / @MinLength(1, { message: "..." })
      if (ts.isDecorator(node) && ts.isCallExpression(node.expression)) {
        for (const arg of node.expression.arguments) {
          if (ts.isObjectLiteralExpression(arg)) add(textOf(arg, constants), node);
        }
      }
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const method = node.expression.name.text;
        const owner = node.expression.expression.getText(source);
        if (method === "notify" && /notifications$/.test(owner) && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])) {
          for (const prop of node.arguments[0].properties) {
            if (ts.isPropertyAssignment(prop) && ["title", "message"].includes(prop.name.getText(source))) add(textOf(prop.initializer, constants), prop);
          }
        }
        if (method === "notify" && /events$/.test(owner)) {
          add([...textOf(node.arguments[2], constants), ...textOf(node.arguments[3], constants)], node);
        }
        if (method === "notifyMany" && /events$/.test(owner)) {
          add([...textOf(node.arguments[3], constants), ...textOf(node.arguments[4], constants)], node);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  // De-duplicate by text/template, keeping the first location.
  const seen = new Set();
  return found.filter((item) => {
    const key = item.text ?? `T:${item.template}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = { collectMessages };

if (require.main === module) {
  for (const item of collectMessages()) console.log(item.text !== undefined ? `"${item.text}"` : `\`${item.template}\``, "  ", item.at);
}
