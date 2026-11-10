import { Fragment, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FileText, Search, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { ApiError, searchDocumentsRequest, type SearchFilters } from "../../services/documents.api";
import { listCategoriesRequest } from "../../services/categories.api";
import type { Category } from "../../types/category";
import type { SearchResult } from "../../types/search";
import { PageState } from "../ui/PageState";
import type { TranslationKey } from "../../i18n";
import { formatPercent } from "../../i18n/format";

const FILE_TYPES: { label: TranslationKey; value: string }[] = [
  { label: "All file types", value: "" },
  { label: "PDF", value: "application/pdf" },
  { label: "Word", value: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  { label: "Images", value: "image/" },
  { label: "Text", value: "text/" },
];

const MATCH_LABEL: Record<SearchResult["matchType"], TranslationKey> = {
  semantic: "Meaning match",
  keyword: "Exact keywords",
  hybrid: "Keywords + meaning",
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Highlights the query's own words inside a passage (display only). */
function Highlighted({ text, query }: { text: string; query: string }) {
  const words = [...new Set(query.split(/[^\p{L}\p{N}_-]+/u).filter((w) => w.length >= 3))].slice(0, 8);
  if (words.length === 0) return <>{text}</>;
  const pattern = new RegExp(`(${words.map(escapeRegExp).join("|")})`, "giu");
  return (
    <>
      {text.split(pattern).map((part, index) =>
        index % 2 === 1 ? <mark key={index}>{part}</mark> : <Fragment key={index}>{part}</Fragment>,
      )}
    </>
  );
}

export default function SemanticSearchPanel() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";

  const [query, setQuery] = useState(initialQuery);
  const [categoryId, setCategoryId] = useState("");
  const [mimeType, setMimeType] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    if (!token) return;
    listCategoriesRequest(token)
      .then(setCategories)
      .catch(() => setCategories([])); // filter is optional; search still works
  }, [token]);

  const filters = useMemo<SearchFilters>(
    () => ({
      categoryId: categoryId ? Number(categoryId) : undefined,
      mimeType: mimeType || undefined,
      createdFrom: createdFrom ? new Date(`${createdFrom}T00:00:00`).toISOString() : undefined,
      createdTo: createdTo ? new Date(`${createdTo}T23:59:59`).toISOString() : undefined,
    }),
    [categoryId, mimeType, createdFrom, createdTo],
  );

  const runSearch = async (value: string) => {
    if (!token || !value.trim()) return;
    setIsSearching(true);
    setError("");
    try {
      const response = await searchDocumentsRequest(token, value.trim(), 15, filters);
      setResults(response.results);
      setSearchedQuery(value.trim());
    } catch (searchError) {
      setResults(null);
      setError(searchError instanceof ApiError ? searchError.message : t("Unable to search your documents right now."));
    } finally {
      setIsSearching(false);
      setHasSearched(true);
    }
  };

  useEffect(() => {
    if (initialQuery.trim()) void runSearch(initialQuery);
    // Only run once on mount for a deep-linked query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (query.trim()) next.set("q", query.trim());
      else next.delete("q");
      return next;
    });
    void runSearch(query);
  };

  return (
    <div className="page-stack">
      <form className="search-experience" onSubmit={onSubmit}>
        <label className="search-field search-field-large">
          <Search />
          <input
            type="search"
            placeholder={t("Ask a question, or search exact terms, names, dates and identifiers")}
            aria-label={t("Hybrid search")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button className="button button-primary" type="submit" disabled={!query.trim() || isSearching}>
          <Sparkles /> {isSearching ? t("Searching...") : t("Search")}
        </button>
      </form>

      <div className="search-filters" aria-label={t("Search filters")}>
        <select aria-label={t("Category")} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">{t("All categories")}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <select aria-label={t("File type")} value={mimeType} onChange={(e) => setMimeType(e.target.value)}>
          {FILE_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {t(type.label)}
            </option>
          ))}
        </select>
        <label className="ai-muted">
          {t("From")} <input type="date" value={createdFrom} max={createdTo || undefined} onChange={(e) => setCreatedFrom(e.target.value)} />
        </label>
        <label className="ai-muted">
          {t("To")} <input type="date" value={createdTo} min={createdFrom || undefined} onChange={(e) => setCreatedTo(e.target.value)} />
        </label>
      </div>

      {!hasSearched && !isSearching ? (
        <PageState
          icon={Sparkles}
          title={t("Search across your document content.")}
          message={t("Hybrid search combines exact keyword matching with AI meaning matching, so identifiers like “FR-06” and paraphrased questions both work.")}
          compact
        />
      ) : isSearching ? (
        <PageState icon={Sparkles} title={t("Searching your documents...")} compact />
      ) : error ? (
        <PageState icon={Search} title={t("Search failed")} message={error} tone="error" compact />
      ) : results && results.length === 0 ? (
        <PageState
          icon={Search}
          title={t("No matching content found.")}
          message={t("Try a different phrase, loosen the filters, or make sure your documents have finished processing.")}
          compact
        />
      ) : results ? (
        <ul className="search-results-list">
          {results.map((result) => (
            <li key={result.chunkId} className="search-result-card">
              <div className="search-result-header">
                <Link to={`/app/documents/${result.document.id}?chunk=${result.chunkIndex}`} className="search-result-doc">
                  <FileText /> {result.document.name} · {t("passage {{number}}", { number: result.chunkIndex + 1 })}
                </Link>
                <span className="search-result-similarity" title={t("Combined keyword + meaning relevance")}>
                  <span className="relevance-bar" aria-hidden="true">
                    <span style={{ width: `${Math.round(result.score * 100)}%` }} />
                  </span>{" "}
                  {t("{{percent}} relevant", { percent: formatPercent(result.score) })}
                </span>
              </div>
              <p className="search-result-snippet">
                <Highlighted text={result.content} query={searchedQuery} />
              </p>
              <span className="ai-badge">{t(MATCH_LABEL[result.matchType])}</span>{" "}
              <span className="ai-muted">{t("meaning similarity {{percent}}", { percent: formatPercent(result.similarity) })}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
