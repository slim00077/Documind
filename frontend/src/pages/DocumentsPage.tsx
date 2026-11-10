import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useWorkspace } from "../context/WorkspaceContext";
import { FileText, FolderTree, Plus, Search, Star, Trash2, Users } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import {
  ApiError,
  deleteDocumentRequest,
  listDocumentsRequest,
  setDocumentFavoriteRequest,
} from "../services/documents.api";
import { listCategoriesRequest } from "../services/categories.api";
import type { Document, DocumentStatus } from "../types/document";
import type { Category } from "../types/category";
import CreateDocumentModal from "../components/documents/CreateDocumentModal";
import ConfirmDialog from "../components/documents/ConfirmDialog";
import DocumentCard from "../components/documents/DocumentCard";
import TrashPanel from "../components/documents/TrashPanel";
import SharedDocumentsPanel from "../components/documents/SharedDocumentsPanel";
import CategoryManagerPanel from "../components/categories/CategoryManagerPanel";
import { PageState } from "../components/ui/PageState";
import { SkeletonDocumentCard } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/ToastProvider";
import { formatFileSize } from "../utils/formatFileSize";
import { DOCUMENT_STATUS_LABEL } from "../config/documents";
import { intlLocale, type TranslationKey } from "../i18n";

type SortOption = "newest" | "oldest" | "name-asc" | "name-desc" | "largest";
type Tab = "library" | "shared" | "categories" | "trash";

const TABS: { key: Tab; label: TranslationKey; icon: typeof FileText }[] = [
  { key: "library", label: "Library", icon: FileText },
  { key: "shared", label: "Shared with me", icon: Users },
  { key: "categories", label: "Categories", icon: FolderTree },
  { key: "trash", label: "Trash", icon: Trash2 },
];

const STATUS_OPTIONS: DocumentStatus[] = [
  "PENDING",
  "UPLOADED",
  "PROCESSING",
  "READY",
  "COMPLETED",
  "FAILED",
];

export default function DocumentsPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { showToast } = useToast();
  const { current: orgWorkspace } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();

  const tab: Tab = (["library", "shared", "categories", "trash"] as Tab[]).includes(
    searchParams.get("tab") as Tab
  )
    ? (searchParams.get("tab") as Tab)
    : "library";

  const setTab = (next: Tab) => {
    setSearchParams((previous) => {
      const params = new URLSearchParams(previous);
      if (next === "library") {
        params.delete("tab");
      } else {
        params.set("tab", next);
      }
      return params;
    });
  };

  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [categories, setCategories] = useState<Category[]>([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const loadDocuments = async (activeToken: string) => {
    setIsLoading(true);
    setLoadError("");

    try {
      const result = await listDocumentsRequest(activeToken);
      setDocuments(result);
    } catch (error) {
      setLoadError(
        error instanceof ApiError
          ? error.message
          : t("Unable to load your documents right now.")
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!token) {
      return;
    }
    void loadDocuments(token);
  }, [token]);

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
        if (isActive) {
          showToast(t("Unable to load categories right now."), "error");
        }
      });

    return () => {
      isActive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const filteredDocuments = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    const filtered = documents.filter((document) => {
      const matchesTerm =
        !term ||
        document.name.toLowerCase().includes(term) ||
        (document.description ?? "").toLowerCase().includes(term) ||
        (document.originalName ?? "").toLowerCase().includes(term);

      const matchesCategory =
        categoryFilter === "all" ||
        (categoryFilter === "none" && !document.categoryId) ||
        String(document.categoryId) === categoryFilter;

      const matchesStatus = statusFilter === "all" || document.status === statusFilter;

      return matchesTerm && matchesCategory && matchesStatus && (!favoritesOnly || document.isFavorite);
    });

    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "oldest":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "name-asc":
          return a.name.localeCompare(b.name, intlLocale());
        case "name-desc":
          return b.name.localeCompare(a.name, intlLocale());
        case "largest":
          return (b.size ?? 0) - (a.size ?? 0);
        case "newest":
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    return sorted;
  }, [documents, searchTerm, categoryFilter, statusFilter, sortBy, favoritesOnly]);

  const totalSize = useMemo(
    () => documents.reduce((sum, document) => sum + (document.size ?? 0), 0),
    [documents]
  );

  const hasActiveFilters =
    Boolean(searchTerm.trim()) || categoryFilter !== "all" || statusFilter !== "all" || favoritesOnly;

  const onCreated = (document: Document) => {
    setDocuments((previous) => [document, ...previous]);
    setIsCreateOpen(false);
    showToast(t("\"{{name}}\" was added to your library.", { name: document.name }), "success");
  };

  const onToggleFavorite = async (document: Document) => {
    if (!token) return;
    const next = !document.isFavorite;
    const apply = (value: boolean) =>
      setDocuments((previous) =>
        previous.map((item) => (item.id === document.id ? { ...item, isFavorite: value } : item))
      );
    apply(next);
    try {
      await setDocumentFavoriteRequest(token, document.id, next);
    } catch (error) {
      apply(!next);
      showToast(error instanceof ApiError ? error.message : t("Unable to update favorites right now."), "error");
    }
  };

  const onConfirmDelete = async () => {
    if (!token || pendingDeleteId === null) {
      return;
    }

    setIsDeleting(true);
    setDeleteError("");

    try {
      await deleteDocumentRequest(token, pendingDeleteId);
      setDocuments((previous) => previous.filter((document) => document.id !== pendingDeleteId));
      setPendingDeleteId(null);
      showToast(t("Document moved to Trash."), "success");
    } catch (error) {
      setDeleteError(
        error instanceof ApiError ? error.message : t("Unable to delete this document right now.")
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="section-kicker">{t("Document workspace")}</p>
          <h1>{t("Documents")}</h1>
          <p>{t("Bring every file into one organized, searchable workspace.")}</p>
        </div>
        {tab === "library" ? (
          <button className="button button-primary" type="button" onClick={() => setIsCreateOpen(true)}>
            <Plus /> {t("New document")}
          </button>
        ) : null}
      </div>

      {orgWorkspace ? (
        <p className="role-note">
          <span>
            <Trans
              i18nKey="You are in the <b>{{name}}</b> workspace. These are the documents shared there; the AI assistant and search stay inside this organization. Your personal library is untouched: switch to Personal to see or upload your own files."
              values={{ name: orgWorkspace.organization.name }}
              components={{ b: <strong /> }}
            />
          </span>
        </p>
      ) : null}

      <div className="tab-strip" role="tablist" aria-label={t("Documents view")}>
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`tab-strip-item ${tab === key ? "active" : ""}`}
            onClick={() => setTab(key)}
          >
            <Icon /> {t(label)}
            {key === "categories" && categories.length > 0 ? (
              <span className="tab-strip-count">{categories.length}</span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "shared" ? (
        <SharedDocumentsPanel />
      ) : tab === "trash" ? (
        <TrashPanel onRestored={(document) => setDocuments((previous) => [document, ...previous])} />
      ) : tab === "categories" ? (
        <CategoryManagerPanel
          categories={categories}
          onCreated={(category) =>
            setCategories((previous) => [...previous, category].sort((a, b) => a.name.localeCompare(b.name)))
          }
          onUpdated={(category) =>
            setCategories((previous) => previous.map((item) => (item.id === category.id ? category : item)))
          }
          onDeleted={(id) => {
            setCategories((previous) => previous.filter((item) => item.id !== id));
            setDocuments((previous) =>
              previous.map((document) =>
                document.categoryId === id ? { ...document, categoryId: null, category: null } : document
              )
            );
          }}
        />
      ) : (
        <>
          <div className="toolbar documents-toolbar">
            <label className="search-field">
              <Search />
              <input
                type="search"
                placeholder={t("Search by name, description, or file")}
                aria-label={t("Search documents")}
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </label>

            <select
              className="auth-input filter-select"
              aria-label={t("Filter by category")}
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option value="all">{t("All categories")}</option>
              <option value="none">{t("Uncategorized")}</option>
              {categories.map((category) => (
                <option key={category.id} value={String(category.id)}>
                  {category.name}
                </option>
              ))}
            </select>

            <select
              className="auth-input filter-select"
              aria-label={t("Filter by status")}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">{t("All statuses")}</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {t(DOCUMENT_STATUS_LABEL[status])}
                </option>
              ))}
            </select>

            <button
              type="button"
              className={`button button-secondary favorites-toggle ${favoritesOnly ? "is-active" : ""}`}
              aria-pressed={favoritesOnly}
              onClick={() => setFavoritesOnly((previous) => !previous)}
            >
              <Star /> {t("Favorites")}
            </button>

            <select
              className="auth-input filter-select"
              aria-label={t("Sort documents")}
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as SortOption)}
            >
              <option value="newest">{t("Newest first")}</option>
              <option value="oldest">{t("Oldest first")}</option>
              <option value="name-asc">{t("Name A-Z")}</option>
              <option value="name-desc">{t("Name Z-A")}</option>
              <option value="largest">{t("Largest file")}</option>
            </select>
          </div>

          {!isLoading && !loadError ? (
            <p className="documents-summary">
              {t("{{count}} documents", { count: documents.length })} &middot;{" "}
              {t("{{count}} categories", { count: categories.length })} &middot;{" "}
              {t("{{size}} used", { size: formatFileSize(totalSize) })}
            </p>
          ) : null}

          {isLoading ? (
            <ul className="document-list">
              {Array.from({ length: 4 }).map((_, index) => (
                <SkeletonDocumentCard key={index} />
              ))}
            </ul>
          ) : loadError ? (
            <PageState
              icon={FileText}
              title={t("Couldn't load your documents")}
              message={loadError}
              tone="error"
              action={
                <button className="button button-secondary" type="button" onClick={() => token && void loadDocuments(token)}>
                  {t("Try again")}
                </button>
              }
            />
          ) : filteredDocuments.length === 0 ? (
            documents.length === 0 ? (
              <PageState
                icon={FileText}
                title={t("Your documents will appear here.")}
                message={t("Upload your first document to start building your workspace.")}
                action={
                  <button className="button button-primary" type="button" onClick={() => setIsCreateOpen(true)}>
                    <Plus /> {t("New document")}
                  </button>
                }
              />
            ) : (
              <PageState
                icon={FileText}
                title={t("No documents match your filters.")}
                message={t("Try a different search term or clear your filters.")}
                action={
                  hasActiveFilters ? (
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => {
                        setSearchTerm("");
                        setCategoryFilter("all");
                        setStatusFilter("all");
                        setFavoritesOnly(false);
                      }}
                    >
                      {t("Clear filters")}
                    </button>
                  ) : undefined
                }
              />
            )
          ) : (
            <ul className="document-list">
              {filteredDocuments.map((document) => (
                <DocumentCard
                  key={document.id}
                  document={document}
                  onDelete={setPendingDeleteId}
                  onToggleFavorite={onToggleFavorite}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {isCreateOpen && token ? (
        <CreateDocumentModal
          token={token}
          categories={categories}
          onCreated={onCreated}
          onClose={() => setIsCreateOpen(false)}
        />
      ) : null}

      {pendingDeleteId !== null ? (
        <ConfirmDialog
          title={t("Move to Trash")}
          message={t("This document will be moved to Trash. You can restore it or delete it permanently from there.")}
          confirmLabel={t("Move to Trash")}
          isBusy={isDeleting}
          error={deleteError}
          onConfirm={onConfirmDelete}
          onCancel={() => {
            setPendingDeleteId(null);
            setDeleteError("");
          }}
        />
      ) : null}
    </section>
  );
}
