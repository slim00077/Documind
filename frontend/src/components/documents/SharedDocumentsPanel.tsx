import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ApiError, listSharedDocumentsRequest, setDocumentFavoriteRequest } from "../../services/documents.api";
import type { SharedDocument } from "../../types/document";
import { PageState } from "../ui/PageState";
import { SkeletonDocumentCard } from "../ui/Skeleton";
import DocumentCard from "./DocumentCard";

export default function SharedDocumentsPanel() {
  const { token } = useAuth();
  const [documents, setDocuments] = useState<SharedDocument[] | null>(null);
  const [error, setError] = useState("");

  const load = (activeToken: string) => {
    setError("");
    listSharedDocumentsRequest(activeToken)
      .then(setDocuments)
      .catch((loadError) =>
        setError(loadError instanceof ApiError ? loadError.message : "Unable to load shared documents.")
      );
  };

  useEffect(() => {
    if (!token) return;
    load(token);
  }, [token]);

  const onToggleFavorite = async (document: SharedDocument) => {
    if (!token) return;
    const next = !document.isFavorite;
    const apply = (value: boolean) =>
      setDocuments((previous) =>
        previous?.map((item) => (item.id === document.id ? { ...item, isFavorite: value } : item)) ?? null
      );
    apply(next);
    try {
      await setDocumentFavoriteRequest(token, document.id, next);
    } catch {
      apply(!next);
    }
  };

  if (error) {
    return (
      <PageState
        icon={Users}
        title="Couldn't load shared documents"
        message={error}
        tone="error"
        action={
          <button className="button button-secondary" type="button" onClick={() => token && load(token)}>
            Try again
          </button>
        }
      />
    );
  }

  if (documents === null) {
    return (
      <ul className="document-list">
        {Array.from({ length: 3 }).map((_, index) => (
          <SkeletonDocumentCard key={index} />
        ))}
      </ul>
    );
  }

  if (documents.length === 0) {
    return (
      <PageState
        icon={Users}
        title="Nothing has been shared with you yet."
        message="Documents that other people or an administrator share with you will appear here."
      />
    );
  }

  return (
    <ul className="document-list">
      {documents.map((document) => (
        <DocumentCard
          key={document.id}
          document={document}
          sharedBy={document.owner.name}
          onDelete={() => undefined}
          onToggleFavorite={() => void onToggleFavorite(document)}
        />
      ))}
    </ul>
  );
}
