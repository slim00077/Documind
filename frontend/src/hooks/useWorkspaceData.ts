import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { ApiError, listDocumentsRequest, listSharedDocumentsRequest } from "../services/documents.api";
import { listConversationsRequest } from "../services/assistant.api";
import type { Document } from "../types/document";
import type { ConversationSummary } from "../types/assistant";
import i18n from "../i18n";

// Real data for the role dashboards, loaded from the existing document and assistant APIs.
export function useWorkspaceData() {
  const { token } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [shared, setShared] = useState<Document[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError("");
    try {
      const [docs, sharedDocs, convs] = await Promise.all([
        listDocumentsRequest(token),
        listSharedDocumentsRequest(token).catch(() => [] as Document[]),
        listConversationsRequest(token).catch(() => [] as ConversationSummary[]),
      ]);
      setDocuments(docs);
      setShared(sharedDocs);
      setConversations(convs);
    } catch (loadError) {
      setError(loadError instanceof ApiError ? loadError.message : i18n.t("Unable to load your workspace right now."));
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  return { documents, shared, conversations, isLoading, error, reload: load };
}
