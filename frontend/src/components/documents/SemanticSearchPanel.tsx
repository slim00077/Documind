import { Fragment, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FileText, Search, Sparkles } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ApiError, searchDocumentsRequest, type SearchFilters } from "../../services/documents.api";
import { listCategoriesRequest } from "../../services/categories.api";
import type { Category } from "../../types/category";
import type { SearchResult } from "../../types/search";
import { PageState } from "../ui/PageState";

const FILE_TYPES = [
  { label: "All file types", value: "" },
  { label: "PDF", value: "application/pdf" },
  { label: "Word", value: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  { label: "Images", value: "image/" },
  { label: "Text", value: "text/" },
];

const MATCH_LABEL = { semantic: "Meaning match", keyword: "Exact keywords", hybrid: "Keywords + meaning" } as const;

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
      setError(searchError instanceof ApiError ? searchError.message : "Unable to search your documents right now.");
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
            placeholder="Ask a question, or search exact terms, names, dates and identifiers"
            aria-label="Hybrid search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button className="button button-primary" type="submit" disabled={!query.trim() || isSearching}>
          <Sparkles /> {isSearching ? "Searching..." : "Search"}
        </button>
      </form>

      <div className="search-filters" aria-label="Search filters">
        <select aria-label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <select aria-label="File type" value={mimeType} onChange={(e) => setMimeType(e.target.value)}>
          {FILE_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
        <label className="ai-muted">
          From <input type="date" value={createdFrom} max={createdTo || undefined} onChange={(e) => setCreatedFrom(e.target.value)} />
        </label>
        <label className="ai-muted">
          To <input type="date" value={createdTo} min={createdFrom || undefined} onChange={(e) => setCreatedTo(e.target.value)} />
        </label>
      </div>

      {!hasSearched && !isSearching ? (
        <PageState
          icon={Sparkles}
          title="Search across your document content."
          message="Hybrid search combines exact keyword matching with AI meaning matching, so identifiers like “FR-06” and paraphrased questions both work."
          compact
        />
      ) : isSearching ? (
        <PageState icon={Sparkles} title="Searching your documents..." compact />
      ) : error ? (
        <PageState icon={Search} title="Search failed" message={error} tone="error" compact />
      ) : results && results.length === 0 ? (
        <PageState
          icon={Search}
          title="No matching content found."
          message="Try a different phrase, loosen the filters, or make sure your documents have finished processing."
          compact
        />
      ) : results ? (
        <ul className="search-results-list">
          {results.map((result) => (
            <li key={result.chunkId} className="search-result-card">
              <div className="search-result-header">
                <Link to={`/app/documents/${result.document.id}?chunk=${result.chunkIndex}`} className="search-result-doc">
                  <FileText /> {result.document.name} · passage {result.chunkIndex + 1}
                </Link>
                <span className="search-result-similarity" title="Combined keyword + meaning relevance">
                  <span className="relevance-bar" aria-hidden="true">
                    <span style={{ width: `${Math.round(result.score * 100)}%` }} />
                  </span>{" "}
                  {Math.round(result.score * 100)}% relevant
                </span>
              </div>
              <p className="search-result-snippet">
                <Highlighted text={result.content} query={searchedQuery} />
              </p>
              <span className="ai-badge">{MATCH_LABEL[result.matchType]}</span>{" "}
              <span className="ai-muted">meaning similarity {Math.round(result.similarity * 100)}%</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
