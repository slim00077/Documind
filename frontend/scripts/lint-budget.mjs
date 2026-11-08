// ESLint quality gate with an error budget (ratchet), used by CI - Frontend.
// The codebase currently has pre-existing ESLint errors (mostly react-hooks/set-state-in-effect
// and react-refresh/only-export-components). Fixing them means touching UI components, so they
// are tracked as debt instead: CI fails as soon as the count goes ABOVE the budget, and the
// budget must be lowered whenever errors are fixed. Writes eslint-report.json for SonarQube.
import { writeFileSync } from "node:fs";
import { ESLint } from "eslint";

const ERROR_BUDGET = 33;

const eslint = new ESLint();
const results = await eslint.lintFiles(["."]);
writeFileSync("eslint-report.json", await (await eslint.loadFormatter("json")).format(results));
console.log(await (await eslint.loadFormatter("stylish")).format(results));

const errors = results.reduce((sum, file) => sum + file.errorCount, 0);
console.log(`ESLint errors: ${errors} (budget: ${ERROR_BUDGET})`);

if (errors > ERROR_BUDGET) {
  console.log(`::error title=ESLint gate failed::${errors} errors > budget ${ERROR_BUDGET}. New lint errors were introduced.`);
  process.exit(1);
}
if (errors > 0) {
  console.log(`::warning title=ESLint debt::${errors} pre-existing ESLint errors are tracked as technical debt.`);
}
if (errors < ERROR_BUDGET) {
  console.log(`::notice title=Lower the ESLint budget::Only ${errors} errors remain - set ERROR_BUDGET to ${errors} in scripts/lint-budget.mjs.`);
}
