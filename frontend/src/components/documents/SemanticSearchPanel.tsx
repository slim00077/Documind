import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FileText, Search, Sparkles } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ApiError, searchDocumentsRequest } from "../../services/documents.api";
import type { SearchResult } from "../../types/search";
import { PageState } from "../ui/PageState";

export default function SemanticSearchPanel() {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  const runSearch = async (value: string) => {
    if (!token || !value.trim()) {
      return;
    }

    setIsSearching(true);
    setError("");

    try {
      const response = await searchDocumentsRequest(token, value.trim(), 15);
      setResults(response.results);
    } catch (searchError) {
      setResults(null);
      setError(
        searchError instanceof ApiError
          ? searchError.message
          : "Unable to search your documents right now."
      );
    } finally {
      setIsSearching(false);
      setHasSearched(true);
    }
  };

  useEffect(() => {
    if (initialQuery.trim()) {
      void runSearch(initialQuery);
    }
    // Only run once on mount for a deep-linked query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (query.trim()) {
        next.set("q", query.trim());
      } else {
        next.delete("q");
      }
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
            placeholder="Ask a question or search document content with AI"
            aria-label="Semantic search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button className="button button-primary" type="submit" disabled={!query.trim() || isSearching}>
          <Sparkles /> {isSearching ? "Searching..." : "Search"}
        </button>
      </form>

      {!hasSearched && !isSearching ? (
        <PageState
          icon={Sparkles}
          title="Search across your document content."
          message="This searches inside what your documents actually say, ranked by AI relevance -- not just filenames."
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
          message="Try a different phrase, or make sure your documents have finished processing."
          compact
        />
      ) : results ? (
        <ul className="search-results-list">
          {results.map((result) => (
            <li key={result.chunkId} className="search-result-card">
              <div className="search-result-header">
                <Link to={`/app/documents/${result.document.id}`} className="search-result-doc">
                  <FileText /> {result.document.name}
                </Link>
                <span className="search-result-similarity">
                  {Math.round(result.similarity * 100)}% match
                </span>
              </div>
              <p className="search-result-snippet">{result.content}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
