import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { MailCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import AuthShell from "../components/layout/AuthShell";
import { useAuth } from "../context/AuthContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { orgApi, type InvitationPreview } from "../services/organizations.api";
import { messageOf, useAsync } from "../components/org/OrgUi";

/** Public link target: preview who is inviting you, then accept once signed in with the invited email. */
export default function InviteAcceptPage() {
  const { t } = useTranslation();
  const { token = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { token: authToken, isAuthenticated, isBootstrapping, user } = useAuth();
  const { refresh, selectOrg } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const { data, error: previewError, isLoading } = useAsync<InvitationPreview>(() => orgApi.previewInvitation(token), [token]);
  const from = { from: { pathname: location.pathname } };

  const accept = async () => {
    if (!authToken) return;
    setBusy(true);
    setError("");
    try {
      const result = await orgApi.acceptInvitation(authToken, token);
      await refresh();
      selectOrg(result.organizationId);
      navigate(`/org/${result.organizationId}`, { replace: true });
    } catch (e) {
      setError(messageOf(e, t("Unable to accept this invitation.")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <div className="auth-card">
        {isLoading || isBootstrapping ? <p className="auth-hint">{t("Checking your invitation...")}</p> : previewError || !data ? (
          <>
            <h1 className="auth-title">{t("Invitation unavailable")}</h1>
            <p className="auth-hint">{t("This invitation is invalid, already used, revoked or expired. Ask the person who invited you for a new link.")}</p>
            <Link className="button button-secondary" to={isAuthenticated ? "/app/dashboard" : "/"}>{t("Go to DocuMind")}</Link>
          </>
        ) : (
          <>
            <h1 className="auth-title">{t("Join {{name}}", { name: data.organizationName })}</h1>
            <p className="auth-hint">
              {data.groupName
                ? data.role === "ADMIN"
                  ? t("You were invited as an administrator in the group \"{{group}}\".", { group: data.groupName })
                  : data.role === "TEACHER"
                    ? t("You were invited as a teacher in the group \"{{group}}\".", { group: data.groupName })
                    : t("You were invited as a student in the group \"{{group}}\".", { group: data.groupName })
                : data.role === "ADMIN"
                  ? t("You were invited as an administrator.")
                  : data.role === "TEACHER"
                    ? t("You were invited as a teacher.")
                    : t("You were invited as a student.")}{" "}
              {t("The invitation was sent to {{email}}.", { email: data.emailHint })}
            </p>
            <p className="role-note"><MailCheck aria-hidden="true" /><span>{t("Accepting adds this organization next to your personal workspace. Your own documents stay private to you.")}</span></p>
            {isAuthenticated ? (
              <>
                <p className="meta">{t("Signed in as {{email}}", { email: user?.email ?? "" })}</p>
                {error ? <p className="auth-error" role="alert">{error}</p> : null}
                <button className="button button-primary button-lg" type="button" onClick={() => void accept()} disabled={busy}>{busy ? t("Joining...") : t("Accept invitation")}</button>
              </>
            ) : (
              <div className="org-actions">
                <Link className="button button-primary button-lg" to="/login" state={from}>{t("Sign in to accept")}</Link>
                <Link className="button button-secondary button-lg" to="/register" state={from}>{t("Create an account")}</Link>
              </div>
            )}
          </>
        )}
      </div>
    </AuthShell>
  );
}
