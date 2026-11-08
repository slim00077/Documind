import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { MailCheck } from "lucide-react";
import AuthShell from "../components/layout/AuthShell";
import { useAuth } from "../context/AuthContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { orgApi, type InvitationPreview } from "../services/organizations.api";
import { messageOf, useAsync } from "../components/org/OrgUi";

/** Public link target: preview who is inviting you, then accept once signed in with the invited email. */
export default function InviteAcceptPage() {
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
      setError(messageOf(e, "Unable to accept this invitation."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <div className="auth-card">
        {isLoading || isBootstrapping ? <p className="auth-hint">Checking your invitation...</p> : previewError || !data ? (
          <>
            <h1 className="auth-title">Invitation unavailable</h1>
            <p className="auth-hint">This invitation is invalid, already used, revoked or expired. Ask the person who invited you for a new link.</p>
            <Link className="button button-secondary" to={isAuthenticated ? "/app/dashboard" : "/"}>Go to DocuMind</Link>
          </>
        ) : (
          <>
            <h1 className="auth-title">Join {data.organizationName}</h1>
            <p className="auth-hint">You were invited as {data.role === "ADMIN" ? "an administrator" : `a ${data.role.toLowerCase()}`}{data.groupName ? ` in the group "${data.groupName}"` : ""}. The invitation was sent to {data.emailHint}.</p>
            <p className="role-note"><MailCheck aria-hidden="true" /><span>Accepting adds this organization next to your personal workspace. Your own documents stay private to you.</span></p>
            {isAuthenticated ? (
              <>
                <p className="meta">Signed in as {user?.email}</p>
                {error ? <p className="auth-error" role="alert">{error}</p> : null}
                <button className="button button-primary button-lg" type="button" onClick={() => void accept()} disabled={busy}>{busy ? "Joining..." : "Accept invitation"}</button>
              </>
            ) : (
              <div className="org-actions">
                <Link className="button button-primary button-lg" to="/login" state={from}>Sign in to accept</Link>
                <Link className="button button-secondary button-lg" to="/register" state={from}>Create an account</Link>
              </div>
            )}
          </>
        )}
      </div>
    </AuthShell>
  );
}
