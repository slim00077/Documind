/** Fixed sentences the API stores in data (document processing errors), see i18n/serverText.ts. */
const server = {
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
};

export default server;
