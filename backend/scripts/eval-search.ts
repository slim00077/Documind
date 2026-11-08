// Retrieval-quality check: run `npx ts-node scripts/eval-search.ts <userId>`.
// Each query lists a regex that a truly relevant passage must match; we report
// hit@5 and reciprocal rank so before/after changes to search are comparable.
import "reflect-metadata";
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { DocumentSearchService } from "../src/modules/documents/document-search.service";

const CASES: { q: string; kind: "exact" | "paraphrase"; relevant: RegExp }[] = [
  { q: "FR-06", kind: "exact", relevant: /FR-06/ },
  { q: "SCRUM-15", kind: "exact", relevant: /SCRUM-15/ },
  { q: "max_length=30", kind: "exact", relevant: /max_length=30/ },
  { q: "HeatAlert", kind: "exact", relevant: /HeatAlert/i },
  { q: "Jira Timeline epics", kind: "exact", relevant: /Timeline/i },
  { q: "supprimer un reporter supprime ses articles", kind: "paraphrase", relevant: /supprim\w+ un Reporter|CASCADE/i },
  { q: "comment gérer les alertes de canicule par gravité", kind: "paraphrase", relevant: /alertes? canicule/i },
  { q: "options facultatives des champs d'un modèle", kind: "paraphrase", relevant: /Field Options|optionnels/i },
  { q: "exigences non fonctionnelles du projet", kind: "paraphrase", relevant: /non fonctionnel/i },
  { q: "quels sont les objectifs pédagogiques du chapitre", kind: "paraphrase", relevant: /Objectifs pédagogiques/i },
];

async function main() {
  const userId = Number(process.argv[2]);
  if (!userId) throw new Error("usage: eval-search.ts <userId>");
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const search = app.get(DocumentSearchService);
  let hits = 0;
  let mrr = 0;
  for (const c of CASES) {
    const { results } = await search.search(userId, c.q, 5);
    const rank = results.findIndex((r) => c.relevant.test(r.content));
    if (rank >= 0) { hits++; mrr += 1 / (rank + 1); }
    console.log(`${rank >= 0 ? "HIT " : "MISS"} rank=${rank >= 0 ? rank + 1 : "-"} [${c.kind}] ${c.q}`);
  }
  console.log(`hit@5=${hits}/${CASES.length}  MRR=${(mrr / CASES.length).toFixed(3)}`);
  await app.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
