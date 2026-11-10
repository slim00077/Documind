/** Documents library, document detail, upload, versions, sharing, trash and notifications. */
const documents = {
  // Notifications
  "Notifications ({{count}} unread)_one": "Notifications ({{count}} non lue)",
  "Notifications ({{count}} unread)_other": "Notifications ({{count}} non lues)",
  "Mark all read": "Tout marquer comme lu",
  "Couldn't load notifications right now.": "Impossible de charger les notifications pour le moment.",
  "You're all caught up.": "Vous êtes à jour.",
  "Invitations, requests and sharing updates.": "Invitations, demandes et partages.",
  "Mark all as read": "Tout marquer comme lu",
  "Nothing new": "Rien de nouveau",
  "You'll see invitations, request decisions and shared documents here.":
    "Vous verrez ici les invitations, les réponses à vos demandes et les documents partagés.",
  "Open document": "Ouvrir le document",
  "Mark as read": "Marquer comme lu",
  "Delete notification": "Supprimer la notification",

  // Statuses and processing pipeline
  "Pending": "En attente",
  "Uploaded": "Importé",
  "Processing": "En traitement",
  "Ready": "Prêt",
  "Completed": "Terminé",
  "Failed": "Échec",
  "Extracted": "Extrait",
  "Chunked": "Découpé",
  "Embedded": "Indexé",
  "AI Ready": "Prêt pour l’IA",
  "Processing pipeline": "Étapes de traitement",

  // Document card
  "Unknown size": "Taille inconnue",
  "No description yet.": "Pas encore de description.",
  "{{count}} passages_one": "{{count}} passage",
  "{{count}} passages_other": "{{count}} passages",
  "Can edit": "Peut modifier",
  "View only": "Lecture seule",
  "Remove {{name}} from favorites": "Retirer {{name}} des favoris",
  "Add {{name}} to favorites": "Ajouter {{name}} aux favoris",
  "Remove from favorites": "Retirer des favoris",
  "Add to favorites": "Ajouter aux favoris",
  "Ask AI about {{name}}": "Interroger l’IA sur {{name}}",
  "Ask AI about this document": "Interroger l’IA sur ce document",
  "Delete {{name}}": "Supprimer {{name}}",

  // New document
  "PDF, DOCX, TXT, PNG, or JPG": "PDF, DOCX, TXT, PNG ou JPG",
  "Unsupported file type. Allowed formats: {{formats}}.": "Type de fichier non pris en charge. Formats acceptés : {{formats}}.",
  "File is too large. Maximum size is {{size}}.": "Fichier trop volumineux. La taille maximale est de {{size}}.",
  "Name is required.": "Le nom est obligatoire.",
  "Unable to create the document right now. Please try again.": "Impossible de créer le document pour le moment. Veuillez réessayer.",
  "New document": "Nouveau document",
  "Add a document to your library, optionally attaching a file.": "Ajoutez un document à votre bibliothèque, avec un fichier joint si vous le souhaitez.",
  "Description (optional)": "Description (facultatif)",
  "Category (optional)": "Catégorie (facultatif)",
  "No category": "Sans catégorie",
  "File (optional)": "Fichier (facultatif)",
  "Unknown type": "Type inconnu",
  "Remove selected file": "Retirer le fichier sélectionné",
  "Click to choose a file": "Cliquez pour choisir un fichier",
  "{{formats}} · up to {{size}}": "{{formats}} · jusqu’à {{size}}",
  "Uploading {{percent}}%": "Envoi {{percent}} %",
  "Uploading...": "Envoi...",
  "Creating...": "Création...",
  "Create document": "Créer le document",

  // Trash
  "Unable to load Trash.": "Impossible de charger la corbeille.",
  "\"{{name}}\" was restored.": "« {{name}} » a été restauré.",
  "Unable to restore this document.": "Impossible de restaurer ce document.",
  "Document permanently deleted.": "Document supprimé définitivement.",
  "Unable to delete this document.": "Impossible de supprimer ce document.",
  "Unable to load Trash": "Impossible de charger la corbeille",
  "Loading Trash...": "Chargement de la corbeille...",
  "Trash is empty": "La corbeille est vide",
  "Deleted documents appear here until you remove them for good.":
    "Les documents supprimés apparaissent ici jusqu’à ce que vous les supprimiez définitivement.",
  "Deleted {{when}}": "Supprimé {{when}}",
  "Deleted": "Supprimé",
  "Restore": "Restaurer",
  "Delete forever": "Supprimer définitivement",
  "Delete permanently": "Supprimer définitivement",
  "\"{{name}}\" and all its versions will be permanently deleted. This cannot be undone.":
    "« {{name}} » et toutes ses versions seront supprimés définitivement. Cette action est irréversible.",
};

export default documents;
