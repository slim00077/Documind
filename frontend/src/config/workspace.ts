import { API_URL } from "./api";

/**
 * The active workspace is sent to the API as `X-Workspace: org:<id>` on document/AI requests so
 * listings, search and the assistant stay inside one organization (or the personal workspace).
 * It is only a hint: the server verifies membership on every request.
 */
let activeOrgId: number | null = null;

export const setActiveOrgId = (id: number | null) => {
  activeOrgId = id;
};

export const WORKSPACE_INVALID_EVENT = "documind:workspace-invalid";

const SCOPED_PREFIXES = ["/api/documents", "/api/assistant", "/api/conversations", "/api/agent", "/api/intelligence", "/api/categories"];

let installed = false;

export function installWorkspaceFetch() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const headers = new Headers(init?.headers);
    // A caller that sets X-Workspace itself (e.g. "personal" when picking a document to share) wins.
    const scoped = activeOrgId !== null && !headers.has("X-Workspace") && SCOPED_PREFIXES.some((prefix) => url.startsWith(`${API_URL}${prefix}`));
    if (scoped) headers.set("X-Workspace", `org:${activeOrgId}`);
    const next = scoped ? { ...init, headers } : init;
    const response = await nativeFetch(input, next);

    // Membership ended or was suspended while this tab was open: fall back to the personal workspace.
    if (scoped && response.status === 403) {
      response.clone().json().then((data: { message?: string }) => {
        if (data.message?.toLowerCase().includes("not an active member")) window.dispatchEvent(new Event(WORKSPACE_INVALID_EVENT));
      }).catch(() => undefined);
    }
    return response;
  };
}
