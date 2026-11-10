import { useState, type FormEvent } from "react";
import {
  Bot,
  Check,
  KeyRound,
  Languages,
  LogOut,
  Monitor,
  Moon,
  Sparkles,
  Sun,
  UserRound,
  Building2,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { Badge } from "../components/org/OrgUi";
import { useTheme } from "../context/ThemeContext";
import {
  ApiError,
  changePasswordRequest,
  updatePreferencesRequest,
  updateProfileRequest,
  type AiResponseStyle,
  type Theme,
} from "../services/auth.api";
import { useToast } from "../components/ui/ToastProvider";
import { ROLE_LABEL, normalizeRole } from "../config/roles";
import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES, type Language, type TranslationKey } from "../i18n";
import { useLanguage } from "../hooks/useLanguage";

type SettingsTab = "profile" | "security" | "appearance" | "language" | "ai" | "organizations";

const TABS: { key: SettingsTab; label: TranslationKey; icon: typeof UserRound }[] = [
  { key: "profile", label: "Profile", icon: UserRound },
  { key: "security", label: "Security", icon: KeyRound },
  { key: "appearance", label: "Appearance", icon: Sun },
  { key: "language", label: "Language", icon: Languages },
  { key: "ai", label: "AI preferences", icon: Bot },
  { key: "organizations", label: "Organizations", icon: Building2 },
];

const LANGUAGE_HINTS: Record<Language, TranslationKey> = {
  en: "Interface and AI answers in English.",
  fr: "Interface and AI answers in French.",
};

const THEME_OPTIONS: { value: Theme; label: TranslationKey; hint: TranslationKey; icon: typeof Sun }[] = [
  { value: "LIGHT", label: "Light", hint: "Bright background everywhere.", icon: Sun },
  { value: "DARK", label: "Dark", hint: "Dimmed surfaces, easier at night.", icon: Moon },
  { value: "SYSTEM", label: "System", hint: "Match your device setting.", icon: Monitor },
];

const AI_STYLE_OPTIONS: { value: AiResponseStyle; label: TranslationKey; hint: TranslationKey }[] = [
  { value: "CONCISE", label: "Concise", hint: "Short, to-the-point answers." },
  { value: "BALANCED", label: "Balanced", hint: "A sensible mix of brevity and detail." },
  { value: "DETAILED", label: "Detailed", hint: "Thorough answers with more context." },
];

export default function SettingsPage() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const { memberships, selectOrg } = useWorkspace();
  const { user, token, logout, updateUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [tab, setTab] = useState<SettingsTab>("profile");

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [profileError, setProfileError] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const [aiStyle, setAiStyle] = useState<AiResponseStyle>(user?.aiResponseStyle ?? "BALANCED");
  const [isSavingAiStyle, setIsSavingAiStyle] = useState(false);

  const onLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const onSaveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;

    setIsSavingProfile(true);
    setProfileError("");

    try {
      const { user: updated } = await updateProfileRequest(token, { name, email });
      updateUser(updated);
      showToast(t("Profile updated."), "success");
    } catch (error) {
      setProfileError(
        error instanceof ApiError ? error.message : t("Unable to update your profile right now.")
      );
    } finally {
      setIsSavingProfile(false);
    }
  };

  const onChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;

    setIsSavingPassword(true);
    setPasswordError("");
    setPasswordSuccess(false);

    try {
      await changePasswordRequest(token, { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setPasswordSuccess(true);
      showToast(t("Password updated."), "success");
    } catch (error) {
      setPasswordError(
        error instanceof ApiError ? error.message : t("Unable to update your password right now.")
      );
    } finally {
      setIsSavingPassword(false);
    }
  };

  const onSelectTheme = async (next: Theme) => {
    setTheme(next);
    if (!token) return;

    try {
      const { user: updated } = await updatePreferencesRequest(token, { theme: next });
      updateUser(updated);
    } catch {
      showToast(t("Theme saved locally, but could not sync to your account."), "error");
    }
  };

  const onSelectLanguage = async (next: Language) => {
    const synced = await setLanguage(next);
    // Shown in the newly selected language: the switch has already happened.
    showToast(synced ? t("Language saved.") : t("Language saved on this device, but could not sync to your account."), synced ? "success" : "error");
  };

  const onSelectAiStyle = async (next: AiResponseStyle) => {
    if (!token) return;

    setAiStyle(next);
    setIsSavingAiStyle(true);

    try {
      const { user: updated } = await updatePreferencesRequest(token, { aiResponseStyle: next });
      updateUser(updated);
      showToast(t("AI preference saved."), "success");
    } catch (error) {
      showToast(
        error instanceof ApiError ? error.message : t("Unable to save this preference right now."),
        "error"
      );
    } finally {
      setIsSavingAiStyle(false);
    }
  };

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="section-kicker">{t("Preferences")}</p>
          <h1>{t("Settings")}</h1>
          <p>{t("Manage your profile, security, appearance, language and AI preferences.")}</p>
        </div>
      </div>

      <div className="settings-layout">
        <nav className="settings-nav" aria-label={t("Settings sections")}>
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className={`settings-nav-item ${tab === key ? "active" : ""}`}
              onClick={() => setTab(key)}
            >
              <Icon /> {t(label)}
            </button>
          ))}
        </nav>

        {tab === "profile" ? (
          <form className="settings-panel" onSubmit={onSaveProfile}>
            <h2>{t("Profile")}</h2>
            <p className="settings-panel-hint">
              {t("Your identity is connected through your DocuMind account.")}
            </p>

            <div className="settings-field">
              <label htmlFor="settings-name">{t("Name")}</label>
              <input
                id="settings-name"
                className="auth-input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>

            <div className="settings-field">
              <label htmlFor="settings-email">{t("Email")}</label>
              <input
                id="settings-email"
                type="email"
                className="auth-input"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            <div className="settings-field">
              <label>{t("Role")}</label>
              <span>{t(ROLE_LABEL[normalizeRole(user?.role)])}</span>
            </div>

            {profileError ? <p className="auth-error">{profileError}</p> : null}

            <div className="form-actions">
              <button className="button button-primary" type="submit" disabled={isSavingProfile}>
                {isSavingProfile ? t("Saving...") : t("Save changes")}
              </button>
            </div>
          </form>
        ) : null}

        {tab === "security" ? (
          <div className="settings-panel">
            <form onSubmit={onChangePassword}>
              <h2>{t("Security")}</h2>
              <p className="settings-panel-hint">{t("Change your account password.")}</p>

              <div className="settings-field">
                <label htmlFor="current-password">{t("Current password")}</label>
                <input
                  id="current-password"
                  type="password"
                  className="auth-input"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                />
              </div>

              <div className="settings-field" style={{ marginTop: 10 }}>
                <label htmlFor="new-password">{t("New password")}</label>
                <input
                  id="new-password"
                  type="password"
                  className="auth-input"
                  minLength={8}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                />
              </div>

              {passwordError ? <p className="auth-error">{passwordError}</p> : null}
              {passwordSuccess ? (
                <p className="settings-success">{t("Password updated successfully.")}</p>
              ) : null}

              <div className="form-actions">
                <button className="button button-primary" type="submit" disabled={isSavingPassword}>
                  {isSavingPassword ? t("Updating...") : t("Update password")}
                </button>
              </div>
            </form>

            <article className="settings-card settings-logout" style={{ marginTop: 18 }}>
              <LogOut />
              <div>
                <h2>{t("Sign out")}</h2>
                <p>{t("End this session on the current device.")}</p>
                <button className="button button-secondary" type="button" onClick={onLogout}>
                  {t("Log out")}
                </button>
              </div>
            </article>
          </div>
        ) : null}

        {tab === "appearance" ? (
          <div className="settings-panel">
            <h2>{t("Appearance")}</h2>
            <p className="settings-panel-hint">
              {t("Choose how DocuMind looks on this device. Your choice is saved to your account.")}
            </p>

            <div className="option-card-grid">
              {THEME_OPTIONS.map(({ value, label, hint, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  className={`option-card ${theme === value ? "active" : ""}`}
                  onClick={() => onSelectTheme(value)}
                >
                  <Icon />
                  <strong>{t(label)}</strong>
                  <span>{t(hint)}</span>
                  {theme === value ? <Check size={14} /> : null}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {tab === "language" ? (
          <div className="settings-panel">
            <h2>{t("Language")}</h2>
            <p className="settings-panel-hint">
              {t("Choose the language of the interface and of AI answers. Your documents are never translated. Your choice is saved to your account.")}
            </p>

            <div className="option-card-grid" role="radiogroup" aria-label={t("Language")}>
              {SUPPORTED_LANGUAGES.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={language === value}
                  lang={value}
                  className={`option-card ${language === value ? "active" : ""}`}
                  onClick={() => void onSelectLanguage(value)}
                >
                  <Languages />
                  <strong>{LANGUAGE_NAMES[value]}</strong>
                  <span>{t(LANGUAGE_HINTS[value])}</span>
                  {language === value ? <Check size={14} /> : null}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {tab === "organizations" ? (
          <div className="settings-panel">
            <h2>{t("Organizations")}</h2>
            <p className="settings-panel-hint">
              {t("Organizations are optional. Your personal documents, conversations and settings belong to you and stay private when you join or leave one.")}
            </p>
            {memberships.length === 0 ? (
              <p className="inline-empty">{t("You are not part of any organization.")}</p>
            ) : (
              <ul className="org-list">
                {memberships.map((m) => (
                  <li key={m.membershipId}>
                    <span><strong>{m.organization.name}</strong> <Badge value={m.role} /></span>
                    <Link className="button button-secondary" to={`/org/${m.organization.id}/settings`} onClick={() => selectOrg(m.organization.id)}>{t("Manage membership")}</Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="form-actions"><Link className="button button-primary" to="/app/join">{t("Join an organization")}</Link></div>
          </div>
        ) : null}

        {tab === "ai" ? (
          <div className="settings-panel">
            <h2>{t("AI preferences")}</h2>
            <p className="settings-panel-hint">
              {t("Choose the default response style the AI Assistant should aim for.")}
            </p>

            <div className="option-card-grid">
              {AI_STYLE_OPTIONS.map(({ value, label, hint }) => (
                <button
                  key={value}
                  type="button"
                  className={`option-card ${aiStyle === value ? "active" : ""}`}
                  onClick={() => onSelectAiStyle(value)}
                  disabled={isSavingAiStyle}
                >
                  <Sparkles />
                  <strong>{t(label)}</strong>
                  <span>{t(hint)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
