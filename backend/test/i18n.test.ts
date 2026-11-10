import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Harness } from "./harness";
import { resolveLanguage } from "../src/common/i18n/language";
import { translateMessage, translateMessageField } from "../src/common/i18n/translate";
import { buildRagPrompt } from "../src/modules/llm/build-rag-prompt";
import { buildAnalysisPrompt, hashKey, languageKey } from "../src/modules/documents/intelligence/analysis-support";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { collectMessages } = require("../scripts/i18n-messages") as {
  collectMessages: () => { text?: string; template?: string; at: string }[];
};

describe("i18n: language negotiation", () => {
  it("picks the best supported language from Accept-Language", () => {
    assert.equal(resolveLanguage(undefined), "en");
    assert.equal(resolveLanguage(""), "en");
    assert.equal(resolveLanguage("fr"), "fr");
    assert.equal(resolveLanguage("fr-FR,fr;q=0.9,en;q=0.8"), "fr");
    assert.equal(resolveLanguage("de-DE,fr;q=0.7,en;q=0.9"), "en", "highest q wins among supported languages");
    assert.equal(resolveLanguage("de, fr;q=0.5"), "fr", "unsupported languages are skipped");
    assert.equal(resolveLanguage("fr;q=0, en"), "en", "q=0 means not acceptable");
    assert.equal(resolveLanguage("es"), "en", "falls back to English");
  });
});

describe("i18n: every user-facing API message has a French translation", () => {
  const messages = collectMessages();

  it("finds the messages in the source code", () => {
    assert.ok(messages.length > 150, `expected the extractor to find the API messages, got ${messages.length}`);
  });

  it("translates every fixed message", () => {
    const missing = messages
      .filter((m) => m.text !== undefined)
      .filter((m) => translateMessage(m.text!, "fr") === m.text)
      .map((m) => `${m.at}  "${m.text}"`);
    assert.deepEqual(missing, [], `untranslated messages:\n${missing.join("\n")}`);
  });

  it("translates every templated message and keeps the interpolated names unchanged", () => {
    const problems: string[] = [];
    for (const m of messages.filter((item) => item.template !== undefined)) {
      let index = 0;
      const values: string[] = [];
      const sample = m.template!.replace(/\$\{\}/g, () => {
        const value = `Zeta Project ${++index}`;
        values.push(value);
        return value;
      });
      const french = translateMessage(sample, "fr");
      if (french === sample) problems.push(`${m.at}  untranslated: ${m.template}`);
      else if (!values.every((value) => french.includes(value))) problems.push(`${m.at}  lost a value: ${french}`);
    }
    assert.deepEqual(problems, [], problems.join("\n"));
  });

  it("translates the fixed vocabulary inside templates (roles, statuses, nested reasons)", () => {
    assert.equal(translateMessage('"Report.pdf" was shared with you as editor.', "fr"), "« Report.pdf » a été partagé avec vous en tant qu’éditeur.");
    assert.equal(translateMessage("You were assigned to Biology 1 as co-teacher.", "fr"), "Vous avez été affecté à Biology 1 en tant que co-enseignant.");
    assert.equal(translateMessage("Your membership in Acme is now suspended.", "fr"), "Votre adhésion à Acme est désormais suspendue.");
    assert.equal(
      translateMessage('"Scan.png" could not be processed: No extractable text was found in this document.', "fr"),
      "« Scan.png » n’a pas pu être traité : Aucun texte exploitable n’a été trouvé dans ce document.",
    );
    assert.equal(translateMessage("The questions couldn't be generated right now. Please try again shortly.", "fr"),
      "Les questions n’ont pas pu être générées pour le moment. Veuillez réessayer dans quelques instants.");
  });

  it("translates framework validation messages and leaves English and unknown text alone", () => {
    assert.deepEqual(translateMessageField(["property role should not exist", "name must be longer than or equal to 2 characters"], "fr"), [
      "La propriété role n’est pas autorisée",
      "name doit contenir au moins 2 caractères",
    ]);
    assert.equal(translateMessage("Document not found", "en"), "Document not found");
    assert.equal(translateMessage("Some brand new message", "fr"), "Some brand new message");
  });
});

describe("i18n: AI prompts follow the interface language without touching the evidence", () => {
  const chunks = [{ content: "Le préavis est de 60 jours.", documentName: "Contrat.pdf", chunkIndex: 0 }];

  it("asks for a French answer and keeps citations, names and quotations verbatim", () => {
    const prompt = buildRagPrompt("Quel est le préavis ?", chunks, [], { language: "fr" });
    assert.match(prompt, /Write the whole answer in French/);
    assert.match(prompt, /Keep every citation marker exactly as \[n\]/);
    assert.match(prompt, /quoted\s+passages, figures, dates, codes and identifiers exactly as they appear/);
    assert.match(prompt, /<document_context id="1" source="Contrat\.pdf \(chunk 0\)">/, "the evidence block is unchanged");
  });

  it("keeps the historical prompt when no language is requested", () => {
    assert.doesNotMatch(buildRagPrompt("What is the notice?", chunks), /Write the whole answer in/);
  });

  it("analysis prompts translate the model's wording only, and English cache keys are unchanged", () => {
    const fr = buildAnalysisPrompt("Summarise.", [{ name: "Doc", passages: [{ chunkIndex: 0, text: "x" }] }], "fr");
    assert.match(fr, /in French/);
    assert.match(fr, /Copy anything taken from the passages .* exactly as written/);
    assert.deepEqual(languageKey("en"), [], "English analyses keep their existing cache entries");
    assert.equal(hashKey("fp", "short", ...languageKey("en")), hashKey("fp", "short"));
    assert.notEqual(hashKey("fp", "short", ...languageKey("fr")), hashKey("fp", "short"), "French analyses are cached separately");
  });
});

describe("i18n: HTTP API", () => {
  const h = new Harness();
  const FR = { "accept-language": "fr-FR,fr;q=0.9,en;q=0.8" };
  const email = (name: string) => `${name}@i18n.test.local`;

  before(async () => {
    await h.start();
  });
  after(async () => {
    await h.stop();
  });

  it("returns error messages in the caller's language, with the same status and shape", async () => {
    const english = await h.raw("POST", "/api/auth/login", undefined, { email: "nobody@i18n.test.local", password: "Password123!" });
    assert.equal(english.status, 401);
    assert.equal(english.body.message, "Invalid email or password");

    const french = await h.raw("POST", "/api/auth/login", undefined, { email: "nobody@i18n.test.local", password: "Password123!" }, FR);
    assert.equal(french.status, 401);
    assert.equal(french.body.message, "E-mail ou mot de passe incorrect");
    assert.equal(french.body.statusCode, 401);
  });

  it("translates validation messages (arrays) and unknown routes", async () => {
    const invalid = await h.raw("POST", "/api/auth/register", undefined, { name: "", email: "not-an-email", password: "short" }, FR);
    assert.equal(invalid.status, 400);
    assert.ok(Array.isArray(invalid.body.message));
    assert.ok(invalid.body.message.includes("Une adresse e-mail valide est requise"), JSON.stringify(invalid.body));
    assert.ok(invalid.body.message.includes("Le mot de passe doit contenir au moins 8 caractères"), JSON.stringify(invalid.body));

    const missing = await h.raw("GET", "/api/does-not-exist", undefined, undefined, FR);
    assert.equal(missing.status, 404);
    assert.equal(missing.body.message, "Route introuvable : GET /api/does-not-exist");
  });

  it("saves the language chosen at sign-up and through preferences", async () => {
    const res = await h.raw("POST", "/api/auth/register", undefined, { name: "Camille", email: email("camille"), password: "Password123!", language: "FR" });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.language, "FR");
    const token = res.body.token as string;

    const me = await h.raw("GET", "/api/auth/me", token);
    assert.equal(me.body.user.language, "FR", "the preference follows the account to every session");

    const toEnglish = await h.raw("PATCH", "/api/auth/me/preferences", token, { language: "EN" });
    assert.equal(toEnglish.status, 200);
    assert.equal(toEnglish.body.user.language, "EN");

    const invalid = await h.raw("PATCH", "/api/auth/me/preferences", token, { language: "DE" });
    assert.equal(invalid.status, 400);

    const legacy = await h.register("Legacy", email("legacy"));
    const legacyMe = await h.call("GET", "/api/auth/me", legacy.email);
    assert.equal(legacyMe.body.user.language, null, "accounts that never chose keep no preference (browser language applies)");
  });

  it("serves stored notifications in the reader's language and keeps names as written", async () => {
    const reader = await h.register("Reader", email("reader"));
    await h.prisma.notification.create({
      data: { userId: reader.id, type: "PROCESSING_COMPLETED", title: "Document ready", message: '"Plan Q3.docx" finished processing and is ready for search and AI.' },
    });

    const fr = await h.call("GET", "/api/notifications", reader.email, undefined, FR);
    assert.equal(fr.status, 200);
    assert.equal(fr.body.items[0].title, "Document prêt");
    assert.equal(fr.body.items[0].message, "Le traitement de « Plan Q3.docx » est terminé : il est prêt pour la recherche et l’IA.");

    const en = await h.call("GET", "/api/notifications", reader.email);
    assert.equal(en.body.items[0].title, "Document ready", "the stored English text is unchanged");
  });

  it("answers in French with the configured provider chain and keeps sources (no AI quota: none provider)", async () => {
    const asker = await h.register("Asker", email("asker"));
    // Nothing to search: the canned answer is written in the asker's language.
    const empty = await h.call("POST", "/api/assistant/ask", asker.email, { question: "Quel est le préavis du contrat ?" }, FR);
    assert.equal(empty.status, 201);
    assert.equal(empty.body.answer, "Je n’ai rien trouvé de pertinent dans vos documents pour répondre à cette question.");
    assert.deepEqual(empty.body.sources, []);

    const docId = await h.document(asker.id, "Contrat fournisseur", "Le préavis de résiliation est de soixante jours calendaires.");
    const answered = await h.call("POST", "/api/assistant/ask", asker.email, { question: "Quel est le préavis de résiliation ?" }, FR);
    assert.equal(answered.status, 201);
    if (answered.body.sources.length > 0) {
      // The (offline) provider was called with the French language option; citations still point at the document.
      assert.match(answered.body.answer, /Aucun fournisseur de génération de réponses/);
      assert.equal(answered.body.sources[0].documentId, docId);
      assert.equal(answered.body.sources[0].documentName, "Contrat fournisseur", "document names are never translated");
    } else {
      assert.equal(answered.body.answer, "Je n’ai rien trouvé de pertinent dans vos documents pour répondre à cette question.");
    }
  });

  it("localizes the conversation title of an 'Ask AI about this document' chat", async () => {
    const owner = await h.register("Owner", email("owner"));
    const docId = await h.document(owner.id, "Guide.pdf", "Contenu du guide.");
    const created = await h.call("POST", "/api/conversations", owner.email, { documentId: docId }, FR);
    assert.equal(created.status, 201);
    assert.equal(created.body.title, "Demander à l’IA : Guide.pdf");
  });

  it("flags a lost organization membership with a stable code whatever the language", async () => {
    const outsider = await h.register("Outsider", email("outsider"));
    const res = await h.call("GET", "/api/documents", outsider.email, undefined, { ...FR, "x-workspace": "org:999999" });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, "WORKSPACE_MEMBERSHIP_INACTIVE");
    assert.equal(res.body.message, "Vous n’êtes pas membre actif de cette organisation");
  });
});
