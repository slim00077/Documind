import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { FileText, Upload, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { createDocumentRequest, ApiError } from "../../services/documents.api";
import type { Document } from "../../types/document";
import type { Category } from "../../types/category";
import { formatFileSize } from "../../utils/formatFileSize";
import {
  ALLOWED_DOCUMENT_EXTENSIONS,
  ALLOWED_DOCUMENT_FILE_TYPES_LABEL,
  ALLOWED_DOCUMENT_MIME_TYPES,
  MAX_DOCUMENT_FILE_SIZE_BYTES,
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
  const { t } = useTranslation();
  const fileTypesLabel = t(ALLOWED_DOCUMENT_FILE_TYPES_LABEL);
  const maxSizeLabel = formatFileSize(MAX_DOCUMENT_FILE_SIZE_BYTES);
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
      setFileError(t("Unsupported file type. Allowed formats: {{formats}}.", { formats: fileTypesLabel }));
      return;
    }

    if (selected.size > MAX_DOCUMENT_FILE_SIZE_BYTES) {
      setFileError(t("File is too large. Maximum size is {{size}}.", { size: maxSizeLabel }));
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
      setError(t("Name is required."));
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
        setError(t("Unable to create the document right now. Please try again."));
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
        <h2>{t("New document")}</h2>
        <p className="modal-message">
          {t("Add a document to your library, optionally attaching a file.")}
        </p>

        <label className="auth-label" htmlFor="document-name">
          {t("Name")}
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
          {t("Description (optional)")}
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
              {t("Category (optional)")}
            </label>
            <select
              id="document-category"
              className="auth-input"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              disabled={isSubmitting}
            >
              <option value="">{t("No category")}</option>
              {categories.map((category) => (
                <option key={category.id} value={String(category.id)}>
                  {category.name}
                </option>
              ))}
            </select>
          </>
        ) : null}

        <label className="auth-label">{t("File (optional)")}</label>
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
                {file.type || t("Unknown type")} &middot; {formatFileSize(file.size)}
              </span>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label={t("Remove selected file")}
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
            <span>{t("Click to choose a file")}</span>
            <small>
              {t("{{formats}} · up to {{size}}", { formats: fileTypesLabel, size: maxSizeLabel })}
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
            {t("Cancel")}
          </button>
          <button
            type="submit"
            className="button button-primary"
            disabled={isSubmitting || Boolean(fileError)}
          >
            {isSubmitting
              ? file
                ? uploadProgress !== null
                  ? t("Uploading {{percent}}%", { percent: uploadProgress })
                  : t("Uploading...")
                : t("Creating...")
              : t("Create document")}
          </button>
        </div>
      </form>
    </div>
  );
}
