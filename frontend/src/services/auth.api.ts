import { AUTH_API_URL } from "../config/api";
import i18n from "../i18n";

export type Theme = "LIGHT" | "DARK" | "SYSTEM";
export type AiResponseStyle = "CONCISE" | "BALANCED" | "DETAILED";
/** Saved interface language; null until the user picks one (the device/browser language applies). */
export type PreferredLanguage = "EN" | "FR";

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: "USER" | "STUDENT" | "TEACHER" | "ADMIN";
  theme: Theme;
  aiResponseStyle: AiResponseStyle;
  language: PreferredLanguage | null;
};

type AuthResponse = {
  user: AuthUser;
  token: string;
};

type AuthRequestOptions = {
  method: "GET" | "POST" | "PATCH";
  token?: string;
  body?: unknown;
};

export class ApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }
}

const request = async <T>(
  path: string,
  options: AuthRequestOptions
): Promise<T> => {
  const response = await fetch(`${AUTH_API_URL}${path}`, {
    method: options.method,
    headers: {
      "Content-Type": "application/json",
      ...(options.token
        ? {
            Authorization: `Bearer ${options.token}`,
          }
        : {}),
    },
    body:
      options.body !== undefined
        ? JSON.stringify(options.body)
        : undefined,
  });

  const data = (await response.json().catch(() => ({}))) as {
    message?: string;
  } & Partial<T>;

  if (!response.ok) {
    throw new ApiError(
      data.message ?? i18n.t("Request failed"),
      response.status
    );
  }

  return data as T;
};

export const registerRequest = (payload: {
  name: string;
  email: string;
  password: string;
  language?: PreferredLanguage;
}): Promise<AuthResponse> =>
  request<AuthResponse>("/register", {
    method: "POST",
    body: payload,
  });

export const loginRequest = (payload: {
  email: string;
  password: string;
}): Promise<AuthResponse> =>
  request<AuthResponse>("/login", {
    method: "POST",
    body: payload,
  });

export const meRequest = (
  token: string
): Promise<{ user: AuthUser }> =>
  request<{ user: AuthUser }>("/me", {
    method: "GET",
    token,
  });

export const updateProfileRequest = (
  token: string,
  payload: { name?: string; email?: string }
): Promise<{ user: AuthUser }> =>
  request<{ user: AuthUser }>("/me", {
    method: "PATCH",
    token,
    body: payload,
  });

export const changePasswordRequest = (
  token: string,
  payload: { currentPassword: string; newPassword: string }
): Promise<{ message: string }> =>
  request<{ message: string }>("/me/password", {
    method: "PATCH",
    token,
    body: payload,
  });

export const updatePreferencesRequest = (
  token: string,
  payload: { theme?: Theme; aiResponseStyle?: AiResponseStyle; language?: PreferredLanguage }
): Promise<{ user: AuthUser }> =>
  request<{ user: AuthUser }>("/me/preferences", {
    method: "PATCH",
    token,
    body: payload,
  });
