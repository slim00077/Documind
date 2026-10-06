const FALLBACK_API_URL = "http://localhost:3000";

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
