import { useState, type FormEvent } from "react";
import {
  Bot,
  Check,
  KeyRound,
  LogOut,
  Monitor,
  Moon,
  Sparkles,
  Sun,
  UserRound,
  Building2,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
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

type SettingsTab = "profile" | "security" | "appearance" | "ai" | "organizations";

const TABS: { key: SettingsTab; label: string; icon: typeof UserRound }[] = [
  { key: "profile", label: "Profile", icon: UserRound },
  { key: "security", label: "Security", icon: KeyRound },
  { key: "appearance", label: "Appearance", icon: Sun },
  { key: "ai", label: "AI preferences", icon: Bot },
  { key: "organizations", label: "Organizations", icon: Building2 },
];

const THEME_OPTIONS: { value: Theme; label: string; hint: string; icon: typeof Sun }[] = [
  { value: "LIGHT", label: "Light", hint: "Bright background everywhere.", icon: Sun },
  { value: "DARK", label: "Dark", hint: "Dimmed surfaces, easier at night.", icon: Moon },
  { value: "SYSTEM", label: "System", hint: "Match your device setting.", icon: Monitor },
];

const AI_STYLE_OPTIONS: { value: AiResponseStyle; label: string; hint: string }[] = [
  { value: "CONCISE", label: "Concise", hint: "Short, to-the-point answers." },
  { value: "BALANCED", label: "Balanced", hint: "A sensible mix of brevity and detail." },
  { value: "DETAILED", label: "Detailed", hint: "Thorough answers with more context." },
];

export default function SettingsPage() {
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
      showToast("Profile updated.", "success");
    } catch (error) {
      setProfileError(
        error instanceof ApiError ? error.message : "Unable to update your profile right now."
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
      showToast("Password updated.", "success");
    } catch (error) {
      setPasswordError(
        error instanceof ApiError ? error.message : "Unable to update your password right now."
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
      showToast("Theme saved locally, but could not sync to your account.", "error");
    }
  };

  const onSelectAiStyle = async (next: AiResponseStyle) => {
    if (!token) return;

    setAiStyle(next);
    setIsSavingAiStyle(true);

    try {
      const { user: updated } = await updatePreferencesRequest(token, { aiResponseStyle: next });
      updateUser(updated);
      showToast("AI preference saved.", "success");
    } catch (error) {
      showToast(
        error instanceof ApiError ? error.message : "Unable to save this preference right now.",
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
          <p className="section-kicker">Preferences</p>
          <h1>Settings</h1>
          <p>Manage your profile, security, appearance, and AI preferences.</p>
        </div>
      </div>

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className={`settings-nav-item ${tab === key ? "active" : ""}`}
              onClick={() => setTab(key)}
            >
              <Icon /> {label}
            </button>
          ))}
        </nav>

        {tab === "profile" ? (
          <form className="settings-panel" onSubmit={onSaveProfile}>
            <h2>Profile</h2>
            <p className="settings-panel-hint">
              Your identity is connected through your DocuMind account.
            </p>

            <div className="settings-field">
              <label htmlFor="settings-name">Name</label>
              <input
                id="settings-name"
                className="auth-input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>

            <div className="settings-field">
              <label htmlFor="settings-email">Email</label>
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
              <label>Role</label>
              <span>{user?.role ?? "USER"}</span>
            </div>

            {profileError ? <p className="auth-error">{profileError}</p> : null}

            <div className="form-actions">
              <button className="button button-primary" type="submit" disabled={isSavingProfile}>
                {isSavingProfile ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        ) : null}

        {tab === "security" ? (
          <div className="settings-panel">
            <form onSubmit={onChangePassword}>
              <h2>Security</h2>
              <p className="settings-panel-hint">Change your account password.</p>

              <div className="settings-field">
                <label htmlFor="current-password">Current password</label>
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
                <label htmlFor="new-password">New password</label>
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
                <p className="settings-success">Password updated successfully.</p>
              ) : null}

              <div className="form-actions">
                <button className="button button-primary" type="submit" disabled={isSavingPassword}>
                  {isSavingPassword ? "Updating..." : "Update password"}
                </button>
              </div>
            </form>

            <article className="settings-card settings-logout" style={{ marginTop: 18 }}>
              <LogOut />
              <div>
                <h2>Sign out</h2>
                <p>End this session on the current device.</p>
                <button className="button button-secondary" type="button" onClick={onLogout}>
                  Logout
                </button>
              </div>
            </article>
          </div>
        ) : null}

        {tab === "appearance" ? (
          <div className="settings-panel">
            <h2>Appearance</h2>
            <p className="settings-panel-hint">
              Choose how DocuMind looks on this device. Your choice is saved to your account.
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
                  <strong>{label}</strong>
                  <span>{hint}</span>
                  {theme === value ? <Check size={14} /> : null}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {tab === "organizations" ? (
          <div className="settings-panel">
            <h2>Organizations</h2>
            <p className="settings-panel-hint">
              Organizations are optional. Your personal documents, conversations and settings belong to you and stay private when you join or leave one.
            </p>
            {memberships.length === 0 ? (
              <p className="inline-empty">You are not part of any organization.</p>
            ) : (
              <ul className="org-list">
                {memberships.map((m) => (
                  <li key={m.membershipId}>
                    <span><strong>{m.organization.name}</strong> <Badge value={m.role} /></span>
                    <Link className="button button-secondary" to={`/org/${m.organization.id}/settings`} onClick={() => selectOrg(m.organization.id)}>Manage membership</Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="form-actions"><Link className="button button-primary" to="/app/join">Join an organization</Link></div>
          </div>
        ) : null}

        {tab === "ai" ? (
          <div className="settings-panel">
            <h2>AI preferences</h2>
            <p className="settings-panel-hint">
              Choose the default response style the AI Assistant should aim for.
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
                  <strong>{label}</strong>
                  <span>{hint}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
