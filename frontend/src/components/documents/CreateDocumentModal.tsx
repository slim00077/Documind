import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { FileText, Upload, X } from "lucide-react";
import { createDocumentRequest, ApiError } from "../../services/documents.api";
import type { Document } from "../../types/document";
import type { Category } from "../../types/category";
import { formatFileSize } from "../../utils/formatFileSize";
import {
  ALLOWED_DOCUMENT_EXTENSIONS,
  ALLOWED_DOCUMENT_FILE_TYPES_LABEL,
  ALLOWED_DOCUMENT_MIME_TYPES,
  MAX_DOCUMENT_FILE_SIZE_BYTES,
  MAX_DOCUMENT_FILE_SIZE_LABEL,
} from "../../config/documents";

type CreateDocumentModalProps = {
  token: string;
  categories: Category[];
  onCreated: (document: Document) => void;
  onClose: () => void;
};

const isAllowedFile = (file: File): boolean => {
  const extension = file.name
    .slice(file.name.lastIndexOf("."))
    .toLowerCase();

  return (
    ALLOWED_DOCUMENT_MIME_TYPES.includes(
      file.type as (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number]
    ) &&
    ALLOWED_DOCUMENT_EXTENSIONS.includes(
      extension as (typeof ALLOWED_DOCUMENT_EXTENSIONS)[number]
    )
  );
};

export default function CreateDocumentModal({
  token,
  categories,
  onCreated,
  onClose,
}: CreateDocumentModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    event.target.value = "";

    if (!selected) {
      return;
    }

    setFileError("");

    if (!isAllowedFile(selected)) {
      setFileError(
        `Unsupported file type. Allowed formats: ${ALLOWED_DOCUMENT_FILE_TYPES_LABEL}.`
      );
      return;
    }

    if (selected.size > MAX_DOCUMENT_FILE_SIZE_BYTES) {
      setFileError(
        `File is too large. Maximum size is ${MAX_DOCUMENT_FILE_SIZE_LABEL}.`
      );
      return;
    }

    setFile(selected);
  };

  const removeFile = () => {
    setFile(null);
    setFileError("");
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Name is required.");
      return;
    }

    if (fileError) {
      return;
    }

    setIsSubmitting(true);
    setUploadProgress(file ? 0 : null);

    try {
      const created = await createDocumentRequest(
        token,
        {
          name: name.trim(),
          description: description.trim() || undefined,
          categoryId: categoryId ? Number(categoryId) : undefined,
          file: file ?? undefined,
        },
        file ? (percent) => setUploadProgress(percent) : undefined
      );
      onCreated(created);
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        setError(submitError.message);
      } else {
        setError("Unable to create the document right now. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
      setUploadProgress(null);
    }
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <form
        className="modal-card"
        onSubmit={onSubmit}
        noValidate
        onClick={(event) => event.stopPropagation()}
      >
        <h2>New document</h2>
        <p className="modal-message">
          Add a document to your library, optionally attaching a file.
        </p>

        <label className="auth-label" htmlFor="document-name">
          Name
        </label>
        <input
          id="document-name"
          className="auth-input"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={isSubmitting}
          autoFocus
          required
        />

        <label className="auth-label" htmlFor="document-description">
          Description (optional)
        </label>
        <textarea
          id="document-description"
          className="auth-input textarea"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={isSubmitting}
          rows={3}
        />

        {categories.length > 0 ? (
          <>
            <label className="auth-label" htmlFor="document-category">
              Category (optional)
            </label>
            <select
              id="document-category"
              className="auth-input"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              disabled={isSubmitting}
            >
              <option value="">No category</option>
              {categories.map((category) => (
                <option key={category.id} value={String(category.id)}>
                  {category.name}
                </option>
              ))}
            </select>
          </>
        ) : null}

        <label className="auth-label">File (optional)</label>
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_DOCUMENT_EXTENSIONS.join(",")}
          onChange={onFileChange}
          disabled={isSubmitting}
          hidden
        />

        {file ? (
          <div className="file-chip">
            <div className="file-chip-icon">
              <FileText />
            </div>
            <div className="file-chip-info">
              <strong>{file.name}</strong>
              <span>
                {file.type || "Unknown type"} &middot; {formatFileSize(file.size)}
              </span>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Remove selected file"
              onClick={removeFile}
              disabled={isSubmitting}
            >
              <X />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="file-drop"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSubmitting}
          >
            <Upload />
            <span>Click to choose a file</span>
            <small>
              {ALLOWED_DOCUMENT_FILE_TYPES_LABEL} &middot; up to{" "}
              {MAX_DOCUMENT_FILE_SIZE_LABEL}
            </small>
          </button>
        )}

        {fileError ? (
          <p className="auth-error" role="alert">
            {fileError}
          </p>
        ) : null}

        {uploadProgress !== null ? (
          <div
            className="progress-track"
            role="progressbar"
            aria-valuenow={uploadProgress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="progress-fill"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        ) : null}

        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="form-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="button button-primary"
            disabled={isSubmitting || Boolean(fileError)}
          >
            {isSubmitting
              ? file
                ? `Uploading${uploadProgress !== null ? ` ${uploadProgress}%` : "..."}`
                : "Creating..."
              : "Create document"}
          </button>
        </div>
      </form>
    </div>
  );
}
