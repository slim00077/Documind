// Manual smoke test: npx ts-node --transpile-only scripts/smoke-intelligence.ts <ownerId> <strangerId> <docA> <docB>
import "reflect-metadata";
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { DocumentIntelligenceService } from "../src/modules/documents/intelligence/document-intelligence.service";
import { CollectionInsightsService } from "../src/modules/documents/intelligence/collection-insights.service";
import { DocumentSearchService } from "../src/modules/documents/document-search.service";

const step = async (name: string, fn: () => Promise<unknown>) => {
  const t = Date.now();
  try {
    const r = await fn();
    console.log(`\n== ${name} (${Date.now() - t}ms)\n${JSON.stringify(r, null, 1).slice(0, 1800)}`);
  } catch (e) {
    console.log(`\n== ${name} FAILED: ${(e as Error).constructor.name}: ${(e as Error).message}`);
  }
};

async function main() {
  const [owner, stranger, a, b] = process.argv.slice(2).map(Number);
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error", "warn"] });
  const intel = app.get(DocumentIntelligenceService);
  const coll = app.get(CollectionInsightsService);
  const search = app.get(DocumentSearchService);

  await step("search filter mimeType=application/pdf", async () => {
    const r = await search.search(owner, "alertes", 3, undefined, { mimeType: "application/pdf" });
    return r.results.map((x) => ({ d: x.document.name, s: x.score.toFixed(2), m: x.matchType, cov: x.keywordCoverage }));
  });
  await step("search as STRANGER (expect 0)", async () => (await search.search(stranger, "alertes", 5)).count);
  await step("summary STRANGER (expect NotFound)", () => intel.summarize(stranger, a, "short"));
  await step("compare STRANGER (expect NotFound)", () => intel.compare(stranger, [a, b]));
  await step("summary short", () => intel.summarize(owner, a, "short"));
  await step("summary sections", () => intel.summarize(owner, b, "sections"));
  await step("extraction", () => intel.extract(owner, a));
  await step("questions", () => intel.generateQuestions(owner, a, 4, "study"));
  await step("compare", () => intel.compare(owner, [a, b]));
  await step("collection (computed only)", () => coll.analyze(owner, { interpret: false }));
  await step("collection (with AI)", () => coll.analyze(owner, {}));
  await step("collection STRANGER (expect no docs)", () => coll.analyze(stranger, {}));
  await app.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
