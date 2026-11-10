import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, KeyRound, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { useWorkspace } from "../context/WorkspaceContext";
import { orgApi, type OrgSummary } from "../services/organizations.api";
import { PageState } from "../components/ui/PageState";
import { useToast } from "../components/ui/ToastProvider";
import { Badge, ErrorNote, FormModal, Field, formatDate, messageOf, useAsync, useDebounced } from "../components/org/OrgUi";
import { ORG_TYPE_LABEL } from "../config/organizations";

/**
 * Optional: an independent user can ask to join an organization at any time, by its code or from
 * the list of organizations that opted in to being discoverable. An administrator approves.
 */
export default function JoinOrganizationPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { memberships, selectOrg, refresh } = useWorkspace();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [found, setFound] = useState<OrgSummary | null>(null);
  const [codeError, setCodeError] = useState("");
  const [asking, setAsking] = useState<{ org: OrgSummary; code?: string } | null>(null);
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search);

  const orgs = useAsync(() => orgApi.discover(token!, debounced), [token, debounced]);
  const mine = useAsync(() => orgApi.myOrgRequests(token!), [token]);

  const lookup = async (event: FormEvent) => {
    event.preventDefault();
    setCodeError("");
    setFound(null);
    try { setFound(await orgApi.lookup(token!, code)); } catch (e) { setCodeError(messageOf(e, t("No organization matches that code."))); }
  };
  const cancel = async (id: number) => {
    try { await orgApi.cancelOrgRequest(token!, id); showToast(t("Request cancelled."), "success"); void mine.reload(); void orgs.reload(); }
    catch (e) { showToast(messageOf(e, t("Unable to cancel.")), "error"); }
  };

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div><p className="section-kicker">{t("Organizations")}</p><h1>{t("Join an organization")}</h1><p>{t("Optional. Your personal workspace keeps working exactly as it does now, and your personal documents stay private.")}</p></div>
      </div>

      {memberships.length > 0 ? (
        <article className="workspace-panel">
          <div className="panel-head"><h2>{t("Your organizations")}</h2></div>
          <ul className="org-list">
            {memberships.map((m) => (
              <li key={m.membershipId}>
                <span><strong>{m.organization.name}</strong> <Badge value={m.role} /></span>
                <button className="button button-secondary" onClick={() => { selectOrg(m.organization.id); navigate(`/org/${m.organization.id}`); }}>{t("Open")}</button>
              </li>
            ))}
          </ul>
        </article>
      ) : null}

      <div className="dash-grid">
        <article className="workspace-panel">
          <div className="panel-head"><h2>{t("I have an organization code")}</h2></div>
          <form className="copy-field" onSubmit={lookup}>
            <input className="auth-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("Enter the code")} aria-label={t("Organization code")} required minLength={4} maxLength={32} />
            <button className="button button-primary" type="submit"><KeyRound /> {t("Find")}</button>
          </form>
          {codeError ? <p className="auth-error" role="alert">{codeError}</p> : null}
          {found ? (
            <div className="org-found">
              <div><strong>{found.name}</strong><div className="meta">{t(ORG_TYPE_LABEL[found.organizationType] ?? "Organization")}{found.description ? ` · ${found.description}` : ""}</div></div>
              <button className="button button-primary" onClick={() => setAsking({ org: found, code })}>{t("Request to join")}</button>
            </div>
          ) : null}
        </article>

        <article className="workspace-panel">
          <div className="panel-head"><h2>{t("My requests")}</h2></div>
          {mine.error ? <ErrorNote message={mine.error} onRetry={() => void mine.reload()} /> : !mine.data || mine.data.length === 0 ? <p className="inline-empty">{t("You have no requests yet.")}</p> : (
            <ul className="org-list">
              {mine.data.map((r) => (
                <li key={r.id}>
                  <span>{r.organization.name} <span className="meta">{formatDate(r.createdAt)}</span></span>
                  <span><Badge value={r.status} /> {r.status === "PENDING" ? <button className="button button-danger-ghost" onClick={() => void cancel(r.id)}>{t("Cancel")}</button> : null}</span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>

      <div className="panel-head"><h2>{t("Open organizations")}</h2></div>
      <label className="search-field"><Search /><input type="search" placeholder={t("Search organizations")} aria-label={t("Search organizations")} value={search} onChange={(e) => setSearch(e.target.value)} /></label>
      {orgs.error ? <ErrorNote message={orgs.error} onRetry={() => void orgs.reload()} /> : orgs.isLoading && !orgs.data ? <p className="auth-hint">{t("Loading...")}</p> : !orgs.data || orgs.data.length === 0 ? (
        <PageState compact icon={Building2} title={t("No open organizations")} message={t("Organizations that allow requests are listed here. If yours is private, use its code or an invitation link.")} />
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>{t("Organization")}</th><th>{t("Type")}</th><th></th></tr></thead>
            <tbody>
              {orgs.data.map((o) => (
                <tr key={o.id}>
                  <td><strong>{o.name}</strong><div className="meta">{o.description}</div></td><td>{t(ORG_TYPE_LABEL[o.organizationType] ?? "Organization")}</td>
                  <td><button className="button button-primary" onClick={() => setAsking({ org: o })}>{t("Request to join")}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {asking ? <JoinModal org={asking.org} code={asking.code} onClose={() => setAsking(null)} onDone={() => { setAsking(null); setFound(null); setCode(""); showToast(t("Request sent. An administrator will review it."), "success"); void mine.reload(); void orgs.reload(); void refresh(); }} /> : null}
    </section>
  );
}

function JoinModal({ org, code, onClose, onDone }: { org: OrgSummary; code?: string; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [message, setMessage] = useState("");
  return (
    <FormModal title={t("Join {{name}}", { name: org.name })} submitLabel={t("Send request")} onClose={onClose}
      onSubmit={async () => { await orgApi.requestJoin(token!, code ? { code, message: message || undefined } : { organizationId: org.id, message: message || undefined }); onDone(); }}>
      <p className="meta">{t("You would join as a student after an administrator approves. Your personal documents stay private; the organization never sees them.")}</p>
      <Field label={t("Message (optional)")}><textarea className="auth-input" rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t("Who you are, and which class or team you belong to")} /></Field>
    </FormModal>
  );
}
