import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { changeLanguage, currentLanguage, toLanguage, type Language } from "../i18n";
import { updatePreferencesRequest } from "../services/auth.api";

/**
 * Active UI language plus a setter that applies it immediately (and remembers it on this device),
 * then saves it to the signed-in account so it follows the user to other devices and sessions.
 */
export function useLanguage() {
  const { i18n } = useTranslation();
  const { token, user, updateUser } = useAuth();
  const language: Language = toLanguage(i18n.resolvedLanguage ?? i18n.language) ?? "en";

  const setLanguage = useCallback(
    async (next: Language): Promise<boolean> => {
      if (next !== currentLanguage()) await changeLanguage(next);
      if (!token || !user || toLanguage(user.language) === next) return true;
      try {
        const { user: updated } = await updatePreferencesRequest(token, { language: next === "fr" ? "FR" : "EN" });
        updateUser(updated);
        return true;
      } catch {
        // The UI already switched and the device remembers it; only the account sync failed.
        return false;
      }
    },
    [token, user, updateUser],
  );

  return { language, setLanguage };
}
