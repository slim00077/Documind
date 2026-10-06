import { useState, type FormEvent } from "react";
import { Check, FolderTree, Pencil, Plus, Trash2, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import {
  ApiError,
  createCategoryRequest,
  deleteCategoryRequest,
  updateCategoryRequest,
} from "../../services/categories.api";
import type { Category } from "../../types/category";
import ConfirmDialog from "../documents/ConfirmDialog";
import { PageState } from "../ui/PageState";
import { useToast } from "../ui/ToastProvider";

type CategoryManagerPanelProps = {
  categories: Category[];
  onCreated: (category: Category) => void;
  onUpdated: (category: Category) => void;
  onDeleted: (id: number) => void;
};

export default function CategoryManagerPanel({
  categories,
  onCreated,
  onUpdated,
  onDeleted,
}: CategoryManagerPanelProps) {
  const { token } = useAuth();
  const { showToast } = useToast();

  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const onCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !newName.trim()) {
      return;
    }

    setIsCreating(true);
    setCreateError("");

    try {
      const created = await createCategoryRequest(token, newName.trim());
      onCreated(created);
      setNewName("");
      showToast(`Category "${created.name}" created.`, "success");
    } catch (error) {
      setCreateError(
        error instanceof ApiError ? error.message : "Unable to create this category right now."
      );
    } finally {
      setIsCreating(false);
    }
  };

  const startEditing = (category: Category) => {
    setEditingId(category.id);
    setEditingName(category.name);
    setEditError("");
  };

  const onSaveEdit = async (category: Category) => {
    if (!token || !editingName.trim()) {
      return;
    }

    setIsSaving(true);
    setEditError("");

    try {
      const updated = await updateCategoryRequest(token, category.id, editingName.trim());
      onUpdated(updated);
      setEditingId(null);
    } catch (error) {
      setEditError(
        error instanceof ApiError ? error.message : "Unable to rename this category right now."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const onConfirmDelete = async () => {
    if (!token || pendingDeleteId === null) {
      return;
    }

    setIsDeleting(true);
    setDeleteError("");

    try {
      await deleteCategoryRequest(token, pendingDeleteId);
      onDeleted(pendingDeleteId);
      setPendingDeleteId(null);
      showToast("Category deleted.", "success");
    } catch (error) {
      setDeleteError(
        error instanceof ApiError ? error.message : "Unable to delete this category right now."
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="page-stack">
      <form className="category-create-row" onSubmit={onCreate}>
        <input
          className="auth-input"
          type="text"
          placeholder="New category name"
          aria-label="New category name"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          disabled={isCreating}
        />
        <button className="button button-primary" type="submit" disabled={isCreating || !newName.trim()}>
          <Plus /> {isCreating ? "Creating..." : "Add category"}
        </button>
      </form>

      {createError ? (
        <p className="auth-error" role="alert">
          {createError}
        </p>
      ) : null}

      {categories.length === 0 ? (
        <PageState
          icon={FolderTree}
          title="No categories yet."
          message="Create your first category to give documents an intentional home."
          compact
        />
      ) : (
        <ul className="category-list">
          {categories.map((category) => (
            <li key={category.id} className="category-row">
              {editingId === category.id ? (
                <>
                  <input
                    className="auth-input"
                    type="text"
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    disabled={isSaving}
                    autoFocus
                  />
                  <div className="category-row-actions">
                    <button
                      type="button"
                      className="icon-button icon-button-positive"
                      aria-label="Save category name"
                      onClick={() => onSaveEdit(category)}
                      disabled={isSaving || !editingName.trim()}
                    >
                      <Check />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Cancel editing"
                      onClick={() => setEditingId(null)}
                      disabled={isSaving}
                    >
                      <X />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="category-row-icon">
                    <FolderTree />
                  </div>
                  <div className="category-row-info">
                    <strong>{category.name}</strong>
                    <span>
                      {category.documentCount} document{category.documentCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="category-row-actions">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Rename ${category.name}`}
                      onClick={() => startEditing(category)}
                    >
                      <Pencil />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Delete ${category.name}`}
                      onClick={() => setPendingDeleteId(category.id)}
                    >
                      <Trash2 />
                    </button>
                  </div>
                </>
              )}
              {editingId === category.id && editError ? (
                <p className="auth-error" role="alert">
                  {editError}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {pendingDeleteId !== null ? (
        <ConfirmDialog
          title="Delete category"
          message="Documents in this category will become uncategorized. This action cannot be undone."
          confirmLabel="Delete"
          isBusy={isDeleting}
          error={deleteError}
          onConfirm={onConfirmDelete}
          onCancel={() => {
            setPendingDeleteId(null);
            setDeleteError("");
          }}
        />
      ) : null}
    </div>
  );
}
