import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, FileSearch, FileX, MessageSquare, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import {
  ApiError,
  deleteDocumentRequest,
  getDocumentChunksRequest,
  getDocumentRequest,
  getDocumentTextRequest,
  updateDocumentRequest,
} from "../services/documents.api";
import { listCategoriesRequest } from "../services/categories.api";
import type { Document } from "../types/document";
import type { Category } from "../types/category";
import StatusBadge from "../components/documents/StatusBadge";
import ProcessingSteps from "../components/documents/ProcessingSteps";
import CitedPassage from "../components/documents/CitedPassage";
import DocumentIntelligencePanel from "../components/documents/DocumentIntelligencePanel";
import DocumentInsightsPanel from "../components/documents/DocumentInsightsPanel";
import DocumentVersionsPanel from "../components/documents/DocumentVersionsPanel";
import ConfirmDialog from "../components/documents/ConfirmDialog";
import { PageState } from "../components/ui/PageState";
import { useToast } from "../components/ui/ToastProvider";
import { formatFileSize } from "../utils/formatFileSize";
import { formatDateTime, formatNumber } from "../i18n/format";
import { translateStoredText } from "../i18n/serverText";

export default function DocumentDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const documentId = Number(id);
  const { token } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [doc, setDoc] = useState<Document | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [categories, setCategories] = useState<Category[]>([]);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategoryId, setEditCategoryId] = useState<string>("");
  const [editError, setEditError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const [embeddedCount, setEmbeddedCount] = useState<number | undefined>(undefined);

  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [isTextVisible, setIsTextVisible] = useState(false);
  const [isLoadingText, setIsLoadingText] = useState(false);
  const [textError, setTextError] = useState("");

  useEffect(() => {
    if (!token || !Number.isFinite(documentId)) {
      return;
    }

    let isActive = true;

    const load = async () => {
      setIsLoading(true);
      setLoadError("");

      try {
        const result = await getDocumentRequest(token, documentId);
        if (isActive) {
          setDoc(result);
          setEditName(result.name);
          setEditDescription(result.description ?? "");
          setEditCategoryId(result.categoryId ? String(result.categoryId) : "");
        }
      } catch (error) {
        if (isActive) {
          setLoadError(
            error instanceof ApiError
              ? error.message
              : t("Unable to load this document right now.")
          );
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      isActive = false;
    };
  }, [token, documentId, t]);

  // Real embedding progress for the timeline; refreshes whenever the document is reprocessed.
  const docUpdatedAt = doc?.updatedAt;
  useEffect(() => {
    if (!token || !Number.isFinite(documentId) || !docUpdatedAt) {
      return;
    }
    let isActive = true;
    getDocumentChunksRequest(token, documentId)
      .then((info) => {
        if (isActive) setEmbeddedCount(info.embeddedCount);
      })
      .catch(() => {
        // Timeline falls back to status-based inference.
      });
    return () => {
      isActive = false;
    };
  }, [token, documentId, docUpdatedAt]);

  useEffect(() => {
    if (!token) {
      return;
    }

    let isActive = true;

    listCategoriesRequest(token)
      .then((result) => {
        if (isActive) {
          setCategories(result);
        }
      })
      .catch(() => {
        // Category selection is a nice-to-have on this page; a failed load
        // just leaves the edit form without a category picker.
      });

    return () => {
      isActive = false;
    };
  }, [token]);

  const startEditing = () => {
    if (!doc) {
      return;
    }
    setEditName(doc.name);
    setEditDescription(doc.description ?? "");
    setEditCategoryId(doc.categoryId ? String(doc.categoryId) : "");
    setEditError("");
    setIsEditing(true);
  };

  const onSaveEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEditError("");

    if (!token || !doc) {
      return;
    }

    if (!editName.trim()) {
      setEditError(t("Name is required."));
      return;
    }

    setIsSaving(true);

    try {
      const updated = await updateDocumentRequest(token, doc.id, {
        name: editName.trim(),
        description: editDescription.trim(),
        categoryId: editCategoryId ? Number(editCategoryId) : null,
      });
      setDoc(updated);
      setIsEditing(false);
      showToast(t("Document updated."), "success");
    } catch (error) {
      setEditError(
        error instanceof ApiError
          ? error.message
          : t("Unable to save your changes right now.")
      );
    } finally {
      setIsSaving(false);
    }
  };

  const onToggleExtractedText = async () => {
    if (isTextVisible) {
      setIsTextVisible(false);
      return;
    }

    if (extractedText !== null) {
      setIsTextVisible(true);
      return;
    }

    if (!token || !doc) {
      return;
    }

    setIsLoadingText(true);
    setTextError("");

    try {
      const result = await getDocumentTextRequest(token, doc.id);
      setExtractedText(result.extractedText);
      setIsTextVisible(true);
    } catch (error) {
      setTextError(
        error instanceof ApiError
          ? error.message
          : t("Unable to load the extracted text right now.")
      );
    } finally {
      setIsLoadingText(false);
    }
  };

  const onConfirmDelete = async () => {
    if (!token || !doc) {
      return;
    }

    setIsDeleting(true);
    setDeleteError("");

    try {
      await deleteDocumentRequest(token, doc.id);
      showToast(t("\"{{name}}\" was moved to Trash.", { name: doc.name }), "success");
      navigate("/app/documents", { replace: true });
    } catch (error) {
      setDeleteError(
        error instanceof ApiError
          ? error.message
          : t("Unable to delete this document right now.")
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <section className="page-stack">
      <Link to="/app/documents" className="back-link">
        <ArrowLeft /> {t("Back to documents")}
      </Link>

      {isLoading ? (
        <PageState icon={FileSearch} title={t("Loading document...")} compact />
      ) : loadError ? (
        <PageState icon={FileX} title={t("Document not found")} message={loadError} tone="error" compact />
      ) : doc ? (
        <div className="workspace-panel detail-panel">
          {isEditing ? (
            <form onSubmit={onSaveEdit} noValidate>
              <label className="auth-label" htmlFor="edit-name">
                {t("Name")}
              </label>
              <input
                id="edit-name"
                className="auth-input"
                type="text"
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                disabled={isSaving}
                autoFocus
                required
              />

              <label className="auth-label" htmlFor="edit-description">
                {t("Description")}
              </label>
              <textarea
                id="edit-description"
                className="auth-input textarea"
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
                disabled={isSaving}
                rows={4}
              />

              <label className="auth-label" htmlFor="edit-category">
                {t("Category")}
              </label>
              <select
                id="edit-category"
                className="auth-input"
                value={editCategoryId}
                onChange={(event) => setEditCategoryId(event.target.value)}
                disabled={isSaving}
              >
                <option value="">{t("No category")}</option>
                {categories.map((category) => (
                  <option key={category.id} value={String(category.id)}>
                    {category.name}
                  </option>
                ))}
              </select>

              {editError ? (
                <p className="auth-error" role="alert">
                  {editError}
                </p>
              ) : null}

              <div className="form-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setIsEditing(false)}
                  disabled={isSaving}
                >
                  {t("Cancel")}
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={isSaving}
                >
                  {isSaving ? t("Saving...") : t("Save changes")}
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="panel-heading detail-heading">
                <div>
                  <StatusBadge status={doc.status} />
                  <h2>{doc.name}</h2>
                </div>
                <div className="detail-actions">
                  {doc.status === "READY" || doc.status === "COMPLETED" ? (
                    <Link to={`/app/assistant?document=${doc.id}`} className="button button-primary">
                      <MessageSquare /> {t("Ask AI")}
                    </Link>
                  ) : null}
                  {!doc.accessRole || doc.accessRole === "OWNER" || doc.accessRole === "EDITOR" ? (
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={startEditing}
                    >
                      <Pencil /> {t("Edit")}
                    </button>
                  ) : null}
                  {!doc.accessRole || doc.accessRole === "OWNER" ? (
                    <button
                      type="button"
                      className="button button-danger"
                      onClick={() => setIsDeleteOpen(true)}
                    >
                      <Trash2 /> {t("Delete")}
                    </button>
                  ) : null}
                </div>
              </div>

              <p>{doc.description || t("No description yet.")}</p>

              <CitedPassage documentId={doc.id} />

              <ProcessingSteps
                status={doc.status}
                hasExtractedText={doc.hasExtractedText}
                chunkCount={doc.chunkCount}
                embeddedCount={embeddedCount}
              />

              <dl className="detail-meta">
                <div>
                  <dt>{t("Category")}</dt>
                  <dd>{doc.category?.name ?? t("Uncategorized")}</dd>
                </div>
                <div>
                  <dt>{t("Created")}</dt>
                  <dd>{formatDateTime(doc.createdAt)}</dd>
                </div>
                <div>
                  <dt>{t("Last updated")}</dt>
                  <dd>{formatDateTime(doc.updatedAt)}</dd>
                </div>
                <div>
                  <dt>{t("Original file")}</dt>
                  <dd>{doc.originalName ?? t("Not uploaded yet")}</dd>
                </div>
                {doc.mimeType ? (
                  <div>
                    <dt>{t("File type")}</dt>
                    <dd>{doc.mimeType}</dd>
                  </div>
                ) : null}
                {doc.size !== null ? (
                  <div>
                    <dt>{t("File size")}</dt>
                    <dd>{formatFileSize(doc.size)}</dd>
                  </div>
                ) : null}
                {doc.chunkCount > 0 ? (
                  <div>
                    <dt>{t("Chunks")}</dt>
                    <dd>{formatNumber(doc.chunkCount)}</dd>
                  </div>
                ) : null}
              </dl>

              {doc.status === "FAILED" && doc.processingError ? (
                <p className="processing-error" role="alert">
                  <AlertTriangle /> {translateStoredText(doc.processingError, t)}
                </p>
              ) : null}

              <DocumentInsightsPanel
                doc={doc}
                canGenerate={!doc.accessRole || doc.accessRole === "OWNER" || doc.accessRole === "EDITOR"}
                onGenerated={(insights, insightsGeneratedAt) =>
                  setDoc((previous) => (previous ? { ...previous, insights, insightsGeneratedAt } : previous))
                }
              />

              <DocumentIntelligencePanel documentId={doc.id} isReady={doc.status === "READY"} />

              <DocumentVersionsPanel
                doc={doc}
                canEdit={!doc.accessRole || doc.accessRole === "OWNER" || doc.accessRole === "EDITOR"}
                onDocumentChanged={(updated) => {
                  setDoc(updated);
                  setExtractedText(null);
                  setIsTextVisible(false);
                }}
              />

              {doc.hasExtractedText ? (
                <div className="extracted-text-section">
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={onToggleExtractedText}
                    disabled={isLoadingText}
                  >
                    <FileSearch />
                    {isLoadingText
                      ? t("Loading text...")
                      : isTextVisible
                        ? t("Hide extracted text")
                        : t("View extracted text")}
                  </button>

                  {textError ? (
                    <p className="auth-error" role="alert">
                      {textError}
                    </p>
                  ) : null}

                  {isTextVisible && extractedText !== null ? (
                    <pre className="extracted-text">{extractedText}</pre>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {isDeleteOpen ? (
        <ConfirmDialog
          title={t("Move to Trash")}
          message={t("This document will be moved to Trash. You can restore it or delete it permanently from there.")}
          confirmLabel={t("Move to Trash")}
          isBusy={isDeleting}
          error={deleteError}
          onConfirm={onConfirmDelete}
          onCancel={() => {
            setIsDeleteOpen(false);
            setDeleteError("");
          }}
        />
      ) : null}
    </section>
  );
}
