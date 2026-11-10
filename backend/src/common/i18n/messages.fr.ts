/**
 * French versions of every user-facing API message (errors, validation messages, notifications).
 *
 * The source code keeps writing English; responses are translated on the way out when the caller
 * asked for French (see translate.ts and the global exception filter). Keys must match the English
 * text exactly. Templated messages use `${}` for each interpolated value, in order, exactly as
 * `scripts/i18n-messages.js` prints them, and test/i18n.test.ts fails when one is missing.
 * Interpolated values are user content (document, group, organization or person names) and are
 * passed through unchanged; only fixed vocabulary (roles, statuses) is translated.
 */

/** "que" before a consonant, "qu’" before a vowel: "en tant que lecteur" / "en tant qu’éditeur". */
const que = (word: string) => (/^[aeiouyéèêàâîôûh]/i.test(word) ? `qu’${word}` : `que ${word}`);

const PERMISSION_ROLE: Record<string, string> = { viewer: "lecteur", editor: "éditeur", owner: "propriétaire" };
const ORG_ROLE: Record<string, string> = { admin: "administrateur", teacher: "enseignant", student: "étudiant" };
const TEACHER_ROLE: Record<string, string> = { "lead teacher": "enseignant principal", "co-teacher": "co-enseignant" };
const MEMBERSHIP_STATUS: Record<string, string> = { active: "active", pending: "en attente", suspended: "suspendue", removed: "retirée" };

const word = (table: Record<string, string>, value: string) => table[value.toLowerCase()] ?? value;

/** AI output names used in "The ${what} couldn't be generated..." messages: [noun with article, feminine?, plural?]. */
const ANALYSIS_OUTPUT: Record<string, { noun: string; feminine: boolean; plural: boolean }> = {
  summary: { noun: "le résumé", feminine: false, plural: false },
  "section summary": { noun: "le résumé par section", feminine: false, plural: false },
  extraction: { noun: "l’extraction", feminine: true, plural: false },
  questions: { noun: "les questions", feminine: true, plural: true },
  comparison: { noun: "la comparaison", feminine: true, plural: false },
  interpretation: { noun: "l’interprétation", feminine: true, plural: false },
  "collection interpretation": { noun: "l’interprétation", feminine: true, plural: false },
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const couldNotBeGenerated = (what: string) => {
  const output = ANALYSIS_OUTPUT[what];
  if (!output) return `L’élément « ${what} » n’a pas pu être généré`;
  const participle = `généré${output.feminine ? "e" : ""}${output.plural ? "s" : ""}`;
  return `${capitalize(output.noun)} ${output.plural ? "n’ont" : "n’a"} pas pu être ${participle}`;
};

export const FR_MESSAGES: Record<string, string> = {
  // Organizations, groups and memberships
  "Organization not found": "Organisation introuvable",
  "Your role in this organization does not allow this action": "Votre rôle dans cette organisation ne permet pas cette action",
  "Group not found": "Groupe introuvable",
  "You do not manage this group": "Vous ne gérez pas ce groupe",
  "This group is archived and read-only": "Ce groupe est archivé et en lecture seule",
  "Only an organization administrator can assign a lead teacher": "Seul un administrateur de l’organisation peut désigner un enseignant principal",
  "Teacher is not assigned to this group": "Cet enseignant n’est pas affecté à ce groupe",
  "Only an organization administrator can remove a lead teacher": "Seul un administrateur de l’organisation peut retirer un enseignant principal",
  "That person is not an active teacher of this organization": "Cette personne n’est pas un enseignant actif de cette organisation",
  "That person is not a student of this organization": "Cette personne n’est pas un étudiant de cette organisation",
  "Student is not in this group": "Cet étudiant ne fait pas partie de ce groupe",
  "You are not in this group": "Vous ne faites pas partie de ce groupe",
  "No group matches that code": "Aucun groupe ne correspond à ce code",
  "Join this group's organization first, then request access to the group": "Rejoignez d’abord l’organisation de ce groupe, puis demandez l’accès au groupe",
  "Only students can request to join a group": "Seuls les étudiants peuvent demander à rejoindre un groupe",
  "This group is archived and not accepting members": "Ce groupe est archivé et n’accepte plus de membres",
  "You are already in this group": "Vous faites déjà partie de ce groupe",
  "You already have a pending request for this group": "Vous avez déjà une demande en attente pour ce groupe",
  "Pending request not found": "Demande en attente introuvable",
  "Request not found": "Demande introuvable",
  "This request has already been reviewed": "Cette demande a déjà été traitée",
  "This person is no longer an active student of the organization": "Cette personne n’est plus un étudiant actif de l’organisation",
  "This document is already shared with the whole organization": "Ce document est déjà partagé avec toute l’organisation",
  "This document is shared in another organization. Stop sharing it there first.": "Ce document est partagé dans une autre organisation. Arrêtez d’abord de l’y partager.",
  "This document is not shared with the group": "Ce document n’est pas partagé avec le groupe",
  "Only the person who shared it (or an administrator) can stop sharing": "Seule la personne qui l’a partagé (ou un administrateur) peut arrêter le partage",
  "Could not generate a unique code, try again": "Impossible de générer un code unique, veuillez réessayer",
  "Teachers can only invite students": "Les enseignants ne peuvent inviter que des étudiants",
  "Choose the group the student is invited to": "Choisissez le groupe auquel l’étudiant est invité",
  "Only students can be invited to a group": "Seuls des étudiants peuvent être invités dans un groupe",
  "This person is already a member of the organization": "Cette personne est déjà membre de l’organisation",
  "This person is already in the organization: add them to the group directly": "Cette personne fait déjà partie de l’organisation : ajoutez-la directement au groupe",
  "An active invitation for this person already exists. Revoke it to send a new one.": "Une invitation active existe déjà pour cette personne. Révoquez-la pour en envoyer une nouvelle.",
  "An active invitation for this person already exists": "Une invitation active existe déjà pour cette personne",
  "Pending invitation not found": "Invitation en attente introuvable",
  "This invitation was sent to a different email address": "Cette invitation a été envoyée à une autre adresse e-mail",
  "This invitation is invalid or has expired": "Cette invitation est invalide ou a expiré",
  "Your membership of this organization is suspended": "Votre adhésion à cette organisation est suspendue",
  "Logo must be a PNG, JPG or WebP image under 1 MB": "Le logo doit être une image PNG, JPG ou WebP de moins de 1 Mo",
  "A logo image is required": "Une image de logo est requise",
  "No logo": "Aucun logo",
  "No active account with that email. Send an invitation instead.": "Aucun compte actif avec cette adresse e-mail. Envoyez plutôt une invitation.",
  "This account is already a member of the organization": "Ce compte est déjà membre de l’organisation",
  "Member not found": "Membre introuvable",
  "You cannot change your own role or suspend yourself": "Vous ne pouvez ni modifier votre propre rôle ni vous suspendre",
  "An organization must keep at least one active administrator": "Une organisation doit conserver au moins un administrateur actif",
  "No organization matches that code": "Aucune organisation ne correspond à ce code",
  "You are already a member of this organization": "Vous êtes déjà membre de cette organisation",
  "You already have a pending request for this organization": "Vous avez déjà une demande en attente pour cette organisation",
  "Could not create a unique organization address": "Impossible de créer une adresse d’organisation unique",

  // Accounts, authentication and access
  "User not found": "Utilisateur introuvable",
  "You cannot change your own role": "Vous ne pouvez pas modifier votre propre rôle",
  "Email is already registered": "Cette adresse e-mail est déjà utilisée",
  "You cannot disable your own account": "Vous ne pouvez pas désactiver votre propre compte",
  "You cannot delete your own account": "Vous ne pouvez pas supprimer votre propre compte",
  "Cannot delete the last remaining admin": "Impossible de supprimer le dernier administrateur",
  "Invalid email or password": "E-mail ou mot de passe incorrect",
  "This account has been disabled": "Ce compte a été désactivé",
  "Authentication failed": "Échec de l’authentification",
  "Current password is incorrect": "Le mot de passe actuel est incorrect",
  "A valid email is required": "Une adresse e-mail valide est requise",
  "Password is required": "Le mot de passe est obligatoire",
  "Name is required": "Le nom est obligatoire",
  "Password must be at least 8 characters long": "Le mot de passe doit contenir au moins 8 caractères",
  "Authentication token is required": "Un jeton d’authentification est requis",
  "Authorization header must be: Bearer <token>": "L’en-tête Authorization doit être de la forme : Bearer <jeton>",
  "Invalid or expired token": "Jeton invalide ou expiré",
  "This account is no longer active": "Ce compte n’est plus actif",
  "Invalid workspace": "Espace de travail invalide",
  "You are not an active member of this organization": "Vous n’êtes pas membre actif de cette organisation",
  "You do not have access to this resource": "Vous n’avez pas accès à cette ressource",

  // Documents, versions, categories and storage
  "Selected category does not exist": "La catégorie sélectionnée n’existe pas",
  "This document is already in Trash": "Ce document est déjà dans la corbeille",
  "This document is not in Trash": "Ce document n’est pas dans la corbeille",
  "Permission not found": "Autorisation introuvable",
  "Document not found": "Document introuvable",
  "Ownership is tied to the document's uploader, not a grantable permission": "La propriété revient à la personne qui a importé le document ; ce n’est pas une autorisation attribuable",
  "This user already owns the document": "Cet utilisateur est déjà propriétaire du document",
  "Name cannot be empty": "Le nom ne peut pas être vide",
  "Name is too long": "Le nom est trop long",
  "Description is too long": "La description est trop longue",
  "Category not found": "Catégorie introuvable",
  "Unsupported file type. Allowed formats: PDF, DOCX, TXT, PNG, JPG.": "Type de fichier non pris en charge. Formats acceptés : PDF, DOCX, TXT, PNG, JPG.",
  "You only have view access to this document": "Vous n’avez qu’un accès en lecture à ce document",
  "A file is required.": "Un fichier est requis.",
  "Version not found": "Version introuvable",
  "The stored file for this version is no longer available.": "Le fichier enregistré pour cette version n’est plus disponible.",
  "No image available for this document": "Aucune image disponible pour ce document",
  "Document not found in Trash": "Document introuvable dans la corbeille",
  "File storage is temporarily unavailable. Please try again.": "Le stockage des fichiers est temporairement indisponible. Veuillez réessayer.",
  "The stored file is no longer available.": "Le fichier enregistré n’est plus disponible.",
  "This document has no processed content yet.": "Ce document n’a pas encore de contenu traité.",
  "Insights are available once the document is fully processed.": "Les analyses sont disponibles une fois le document entièrement traité.",

  // Search, assistant, agent and AI analysis
  "Search query is required": "La requête de recherche est obligatoire",
  "Search query is too long": "La requête de recherche est trop longue",
  "Invalid MIME type filter": "Filtre de type MIME invalide",
  "Conversation not found": "Conversation introuvable",
  "Message is required": "Le message est obligatoire",
  "Message is too long": "Le message est trop long",
  "Question is required": "La question est obligatoire",
  "Question is too long": "La question est trop longue",
  "Task is required": "La tâche est obligatoire",
  "Task is too long": "La tâche est trop longue",
  "The analysis agent couldn't complete right now. Please try again shortly.": "L’agent d’analyse n’a pas pu terminer pour le moment. Veuillez réessayer dans quelques instants.",
  "The assistant couldn't generate an answer right now. Please try again shortly.": "L’assistant n’a pas pu générer de réponse pour le moment. Veuillez réessayer dans quelques instants.",
  "Choose two different documents to compare.": "Choisissez deux documents différents à comparer.",
  "Choose at least two different documents to compare.": "Choisissez au moins deux documents différents à comparer.",
  "One of the documents has no processed content to compare.": "L’un des documents n’a aucun contenu traité à comparer.",
  "The comparison couldn't be generated right now. Please try again shortly.": "La comparaison n’a pas pu être générée pour le moment. Veuillez réessayer dans quelques instants.",
  "The AI provider didn't return a usable comparison. Check the LLM configuration and try again.":
    "Le fournisseur d’IA n’a pas renvoyé de comparaison exploitable. Vérifiez la configuration du modèle de langage et réessayez.",
  "The AI provider returned the comparison in an unexpected format. Please try again.": "Le fournisseur d’IA a renvoyé la comparaison dans un format inattendu. Veuillez réessayer.",
  "Insights couldn't be generated right now. Please try again shortly.": "Les analyses n’ont pas pu être générées pour le moment. Veuillez réessayer dans quelques instants.",
  "The AI provider didn't return usable insights. Check the LLM configuration and try again.":
    "Le fournisseur d’IA n’a pas renvoyé d’analyses exploitables. Vérifiez la configuration du modèle de langage et réessayez.",
  "The AI provider returned insights in an unexpected format. Please try again.": "Le fournisseur d’IA a renvoyé les analyses dans un format inattendu. Veuillez réessayer.",
  "OPENAI_API_KEY is not configured for the openai embedding provider.": "OPENAI_API_KEY n’est pas configurée pour le fournisseur d’embeddings openai.",
  "No processed documents are available to analyse.": "Aucun document traité n’est disponible pour l’analyse.",
  "The configured AI provider does not support structured output.": "Le fournisseur d’IA configuré ne prend pas en charge les sorties structurées.",
  "The AI provider is rate-limited right now. Please try again in a moment.": "Le fournisseur d’IA est temporairement limité. Veuillez réessayer dans un instant.",
  "The AI provider could not generate an answer right now. Please try again shortly.": "Le fournisseur d’IA n’a pas pu générer de réponse pour le moment. Veuillez réessayer dans quelques instants.",
  "Something went wrong. Please try again.": "Une erreur est survenue. Veuillez réessayer.",

  // Document processing errors (stored on the document and quoted in notifications)
  "No extractable text was found in this document.": "Aucun texte exploitable n’a été trouvé dans ce document.",
  "We couldn't extract text from this file. It may be corrupted or in an unsupported format.":
    "Impossible d’extraire le texte de ce fichier. Il est peut-être endommagé ou dans un format non pris en charge.",
  "Text was extracted, but the document could not be split into chunks.": "Le texte a été extrait, mais le document n’a pas pu être découpé en passages.",
  "Text was extracted and chunked, but embeddings could not be generated.": "Le texte a été extrait et découpé, mais les embeddings n’ont pas pu être générés.",
  "This document's extracted text is too large to process.": "Le texte extrait de ce document est trop volumineux pour être traité.",
  "This image is too large to analyze (maximum 14 MB).": "Cette image est trop volumineuse pour être analysée (14 Mo maximum).",
  "This scanned PDF is too large to analyze (maximum 14 MB).": "Ce PDF numérisé est trop volumineux pour être analysé (14 Mo maximum).",
  "Image analysis is rate-limited right now. Please try again in a few minutes.": "L’analyse d’images est temporairement limitée. Veuillez réessayer dans quelques minutes.",
  "Image analysis isn't available. Check the Gemini API key configuration.": "L’analyse d’images n’est pas disponible. Vérifiez la configuration de la clé d’API Gemini.",
  "Image analysis failed temporarily. Please try again.": "L’analyse d’images a temporairement échoué. Veuillez réessayer.",
  "unknown error": "erreur inconnue",

  // Notification titles
  "Document moved to Trash": "Document placé dans la corbeille",
  "Document restored": "Document restauré",
  "Document shared with you": "Document partagé avec vous",
  "Access level changed": "Niveau d’accès modifié",
  "Access removed": "Accès retiré",
  "Document ready": "Document prêt",
  "Processing failed": "Échec du traitement",
  "New group assigned": "Nouveau groupe attribué",
  "Group assignment": "Affectation à un groupe",
  "Group assignment removed": "Affectation au groupe retirée",
  "Added to a group": "Ajout à un groupe",
  "Removed from a group": "Retrait d’un groupe",
  "New join request": "Nouvelle demande d’accès",
  "Request approved": "Demande acceptée",
  "Request declined": "Demande refusée",
  "New shared document": "Nouveau document partagé",
  "Invitation accepted": "Invitation acceptée",
  "New request to join": "Nouvelle demande d’adhésion",
  "Join request declined": "Demande d’adhésion refusée",

  // Framework defaults (guards, pipes, upload limits, unknown errors)
  "Internal server error": "Erreur interne du serveur",
  "Forbidden resource": "Accès refusé",
  "Unauthorized": "Non autorisé",
  "Forbidden": "Accès refusé",
  "Not Found": "Introuvable",
  "Bad Request": "Requête invalide",
  "Too Many Requests": "Trop de requêtes",
  "File too large": "Fichier trop volumineux",
  "Too many files": "Trop de fichiers",
  "Unexpected field": "Champ inattendu",
  "Validation failed (numeric string is expected)": "Échec de la validation (une valeur numérique est attendue)",
};

/** Templated messages: `${}` marks each interpolated value; the function receives them in order. */
export const FR_TEMPLATES: Record<string, (v: string[]) => string> = {
  "An administrator moved \"${}\" to Trash. You can restore it from Trash.": ([name]) =>
    `Un administrateur a placé « ${name} » dans la corbeille. Vous pouvez le restaurer depuis la corbeille.`,
  "An administrator restored \"${}\" from Trash.": ([name]) => `Un administrateur a restauré « ${name} » depuis la corbeille.`,
  "\"${}\" was shared with you as ${}.": ([name, role]) => `« ${name} » a été partagé avec vous en tant ${que(word(PERMISSION_ROLE, role))}.`,
  "Your access to \"${}\" is now ${}.": ([name, role]) => `Vous êtes désormais ${word(PERMISSION_ROLE, role)} de « ${name} ».`,
  "Your access to \"${}\" was removed.": ([name]) =>
    name === "a document" ? "Votre accès à un document a été retiré." : `Votre accès à « ${name} » a été retiré.`,
  "\"${}\" isn't fully processed yet, so it can't be compared.": ([name]) =>
    `« ${name} » n’est pas encore entièrement traité et ne peut donc pas être comparé.`,
  "\"${}\" finished processing and is ready for search and AI.": ([name]) =>
    `Le traitement de « ${name} » est terminé : il est prêt pour la recherche et l’IA.`,
  "\"${}\" could not be processed: ${}": ([name, reason]) => `« ${name} » n’a pas pu être traité : ${translateFr(reason)}`,
  "\"${}\" isn't fully processed yet.": ([name]) => `« ${name} » n’est pas encore entièrement traité.`,
  "\"${}\" has no processed content yet.": ([name]) => `« ${name} » n’a pas encore de contenu traité.`,
  "The ${} couldn't be generated right now. Please try again shortly.": ([what]) =>
    `${couldNotBeGenerated(what)} pour le moment. Veuillez réessayer dans quelques instants.`,
  "The AI provider returned the ${} in an unexpected format. Please try again.": ([what]) =>
    `Le fournisseur d’IA a renvoyé ${ANALYSIS_OUTPUT[what]?.noun ?? `« ${what} »`} dans un format inattendu. Veuillez réessayer.`,
  "You are the lead teacher of ${}.": ([group]) => `Vous êtes l’enseignant principal de ${group}.`,
  "You were assigned to ${} as ${}.": ([group, role]) => `Vous avez été affecté à ${group} en tant ${que(word(TEACHER_ROLE, role))}.`,
  "You are no longer assigned to ${}.": ([group]) => `Vous n’êtes plus affecté à ${group}.`,
  "You were added to ${}.": ([group]) => `Vous avez été ajouté à ${group}.`,
  "You were removed from ${}.": ([group]) => `Vous avez été retiré de ${group}.`,
  "${} asked to join ${}.": ([person, target]) => `${person} a demandé à rejoindre ${target}.`,
  "You can now access ${}.": ([group]) => `Vous avez désormais accès à ${group}.`,
  "Your request to join ${} was declined.": ([target]) => `Votre demande pour rejoindre ${target} a été refusée.`,
  "\"${}\" was shared with ${}.": ([name, group]) => `« ${name} » a été partagé avec ${group}.`,
  "Invitation from ${}": ([org]) => `Invitation de ${org}`,
  "You were invited to join ${} as ${}. Open your invitation link to accept.": ([org, role]) =>
    `Vous avez été invité à rejoindre ${org} en tant ${que(word(ORG_ROLE, role))}. Ouvrez votre lien d’invitation pour accepter.`,
  "${} accepted the invitation to ${}.": ([person, org]) => `${person} a accepté l’invitation à rejoindre ${org}.`,
  "Added to ${}": ([org]) => `Ajout à ${org}`,
  "You are now a ${} of ${}.": ([role, org]) => `Vous êtes désormais ${word(ORG_ROLE, role)} au sein de ${org}.`,
  "Membership updated: ${}": ([org]) => `Adhésion mise à jour : ${org}`,
  "Your role in ${} is now ${}.": ([org, role]) => `Votre rôle au sein de ${org} est désormais : ${word(ORG_ROLE, role)}.`,
  "Your membership in ${} is now ${}.": ([org, status]) => `Votre adhésion à ${org} est désormais ${word(MEMBERSHIP_STATUS, status)}.`,
  "Welcome to ${}": ([org]) => `Bienvenue dans ${org}`,
  "Your request to join ${} was approved.": ([org]) => `Votre demande pour rejoindre ${org} a été acceptée.`,
  "You administer ${}": ([org]) => `Vous administrez ${org}`,
  "You were made an administrator of ${}.": ([org]) => `Vous avez été nommé administrateur de ${org}.`,
};

/**
 * Framework-generated messages: class-validator defaults for DTO fields without a custom message,
 * and Nest's "Cannot GET /x" for unknown routes. Field names stay as they are (they are API names).
 */
export const FR_PATTERNS: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^property (\S+) should not exist$/, (m) => `La propriété ${m[1]} n’est pas autorisée`],
  [/^(\S+) should not be empty$/, (m) => `${m[1]} ne doit pas être vide`],
  [/^(\S+) must be an email$/, (m) => `${m[1]} doit être une adresse e-mail valide`],
  [/^(\S+) must be a string$/, (m) => `${m[1]} doit être une chaîne de caractères`],
  [/^(\S+) must be a boolean value$/, (m) => `${m[1]} doit être un booléen`],
  [/^(\S+) must be an integer number$/, (m) => `${m[1]} doit être un nombre entier`],
  [/^(\S+) must be a number conforming to the specified constraints$/, (m) => `${m[1]} doit être un nombre`],
  [/^(\S+) must be a positive number$/, (m) => `${m[1]} doit être un nombre positif`],
  [/^(\S+) must be an array$/, (m) => `${m[1]} doit être une liste`],
  [/^(\S+) must be a valid ISO 8601 date string$/, (m) => `${m[1]} doit être une date ISO 8601 valide`],
  [/^(\S+) must be a URL address$/, (m) => `${m[1]} doit être une URL valide`],
  [/^(\S+) must be longer than or equal to (\d+) characters$/, (m) => `${m[1]} doit contenir au moins ${m[2]} caractères`],
  [/^(\S+) must be shorter than or equal to (\d+) characters$/, (m) => `${m[1]} doit contenir au plus ${m[2]} caractères`],
  [/^(\S+) must not be less than (-?\d+(?:\.\d+)?)$/, (m) => `${m[1]} doit être supérieur ou égal à ${m[2]}`],
  [/^(\S+) must not be greater than (-?\d+(?:\.\d+)?)$/, (m) => `${m[1]} doit être inférieur ou égal à ${m[2]}`],
  [/^(\S+) must contain at least (\d+) elements$/, (m) => `${m[1]} doit contenir au moins ${m[2]} éléments`],
  [/^(\S+) must contain no more than (\d+) elements$/, (m) => `${m[1]} doit contenir au plus ${m[2]} éléments`],
  [/^(\S+) must be one of the following values: (.*)$/, (m) => `${m[1]} doit avoir l’une des valeurs suivantes : ${m[2]}`],
  [/^each value in (\S+) must be an integer number$/, (m) => `Chaque valeur de ${m[1]} doit être un nombre entier`],
  [/^All elements of (\S+) must be unique$/, (m) => `Les éléments de ${m[1]} doivent être uniques`],
  [/^Cannot (GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD) (.+)$/, (m) => `Route introuvable : ${m[1]} ${m[2]}`],
];

// Late-bound to avoid a circular import with translate.ts (used by the "could not be processed" template).
let translateFr: (message: string) => string = (message) => message;
export const bindNestedTranslator = (fn: (message: string) => string) => {
  translateFr = fn;
};
