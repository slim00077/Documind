import { API_URL } from "./api";
import { currentLanguage } from "../i18n";

/**
 * The active workspace is sent to the API as `X-Workspace: org:<id>` on document/AI requests so
 * listings, search and the assistant stay inside one organization (or the personal workspace).
 * It is only a hint: the server verifies membership on every request.
 *
 * Every API request also carries `Accept-Language` with the UI language, so server messages and
 * AI answers come back in the language the user is reading.
 */
let activeOrgId: number | null = null;

export const setActiveOrgId = (id: number | null) => {
  activeOrgId = id;
};

export const WORKSPACE_INVALID_EVENT = "documind:workspace-invalid";
/** Stable error code sent by the API when the X-Workspace membership is no longer active. */
const WORKSPACE_MEMBERSHIP_INACTIVE = "WORKSPACE_MEMBERSHIP_INACTIVE";

const SCOPED_PREFIXES = ["/api/documents", "/api/assistant", "/api/conversations", "/api/agent", "/api/intelligence", "/api/categories"];

let installed = false;

const isApiUrl = (url: string) => {
  if (API_URL) return url.startsWith(`${API_URL}/api/`);
  // Same-origin deployments (VITE_API_URL empty): relative or absolute URLs on this origin.
  return url.startsWith("/api/") || url.startsWith(`${window.location.origin}/api/`);
};

export function installWorkspaceFetch() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (!isApiUrl(url)) return nativeFetch(input, init);

    // Start from the Request's own headers so passing `init.headers` never drops them.
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));

    // A caller that sets X-Workspace itself (e.g. "personal" when picking a document to share) wins.
    const scoped = activeOrgId !== null && !headers.has("X-Workspace") && SCOPED_PREFIXES.some((prefix) => url.startsWith(`${API_URL}${prefix}`));
    if (scoped) headers.set("X-Workspace", `org:${activeOrgId}`);
    if (!headers.has("Accept-Language")) headers.set("Accept-Language", currentLanguage());

    const response = await nativeFetch(input, { ...init, headers });

    // Membership ended or was suspended while this tab was open: fall back to the personal workspace.
    if (scoped && response.status === 403) {
      response.clone().json().then((data: { code?: string; message?: string }) => {
        if (data.code === WORKSPACE_MEMBERSHIP_INACTIVE || data.message?.toLowerCase().includes("not an active member")) {
          window.dispatchEvent(new Event(WORKSPACE_INVALID_EVENT));
        }
      }).catch(() => undefined);
    }
    return response;
  };
}
