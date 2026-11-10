import { Link, useNavigate } from "react-router-dom";
import { Building2, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import AuthShell from "../components/layout/AuthShell";
import { useAuth } from "../context/AuthContext";
import { homePath } from "../config/roles";

/**
 * Shown once after sign-up. Both paths are first-class: an independent workspace needs no
 * organization, and joining one is always optional and can be done later from settings.
 */
export default function OnboardingPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  return (
    <AuthShell>
      <div className="auth-card">
        <h1 className="auth-title">{user ? t("Welcome, {{name}}", { name: user.name.split(" ")[0] }) : t("Welcome")}</h1>
        <p className="auth-hint">{t("How would you like to use DocuMind? You can change your mind at any time.")}</p>

        <div className="onboarding-choices">
          <button className="onboarding-choice" type="button" onClick={() => navigate(homePath(user?.role), { replace: true })}>
            <span className="feature-icon"><User /></span>
            <strong>{t("Continue on my own")}</strong>
            <span>{t("Your personal workspace is ready: upload documents, ask the AI, search, summarize and compare. No organization needed.")}</span>
          </button>
          <Link className="onboarding-choice" to="/app/join">
            <span className="feature-icon"><Building2 /></span>
            <strong>{t("Join an organization")}</strong>
            <span>{t("Use an invitation link or an organization code from your school, university or company. An administrator approves your request.")}</span>
          </Link>
        </div>
        <p className="meta" style={{ marginTop: 16 }}>{t("Got an invitation link by email? Open it and you will be taken straight to it.")}</p>
      </div>
    </AuthShell>
  );
}
