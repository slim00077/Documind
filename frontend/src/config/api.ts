// Local dev falls back to the Nest default port; production builds must set VITE_API_URL
// (an empty value means same-origin, e.g. behind a reverse proxy).
const FALLBACK_API_URL = import.meta.env.DEV ? "http://localhost:3000" : "";

export const API_URL =
  import.meta.env.VITE_API_URL ??
  FALLBACK_API_URL;

export const AUTH_API_URL = `${API_URL}/api/auth`;

export const DOCUMENTS_API_URL = `${API_URL}/api/documents`;

export const ASSISTANT_API_URL = `${API_URL}/api/assistant`;

export const CONVERSATIONS_API_URL = `${API_URL}/api/conversations`;

export const CATEGORIES_API_URL = `${API_URL}/api/categories`;

export const ADMIN_API_URL = `${API_URL}/api/admin`;

export const AGENT_API_URL = `${API_URL}/api/agent`;

export const INTELLIGENCE_API_URL = `${API_URL}/api/intelligence`;
