import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, MailPlus, RefreshCw, Trash2, X } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { orgApi, type IssuedInvitation, type OrgRole } from "../../services/organizations.api";
import { PageState } from "../../components/ui/PageState";
import ConfirmDialog from "../../components/documents/ConfirmDialog";
import { useToast } from "../../components/ui/ToastProvider";
import { Badge, CopyField, ErrorNote, Field, FormModal, Modal, formatDate, messageOf, useAsync } from "../../components/org/OrgUi";
import { formatRelativeTime } from "../../utils/formatRelativeTime";
import { useOrg } from "./OrgLayout";

/** Invitation links (admins: anyone; teachers: students into their groups) and requests to join the organization. */
export default function OrgInvitationsPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { orgId, role } = useOrg();
  const { showToast } = useToast();
  const [params, setParams] = useSearchParams();
  const invitePrefill = params.get("invite");
  const [inviting, setInviting] = useState(Boolean(invitePrefill));
  const [issued, setIssued] = useState<IssuedInvitation | null>(null);
  const [revoking, setRevoking] = useState<number | null>(null);
  const isAdmin = role === "ADMIN";

  const invitations = useAsync(() => orgApi.invitations(token!, orgId), [token, orgId]);
  const requests = useAsync(() => (isAdmin ? orgApi.joinRequests(token!, orgId) : Promise.resolve([])), [token, orgId, isAdmin]);

  const closeInvite = () => { setInviting(false); if (params.has("invite")) { params.delete("invite"); setParams(params, { replace: true }); } };

  const review = async (id: number, approve: boolean) => {
    try { await orgApi.reviewJoinRequest(token!, orgId, id, approve); showToast(approve ? t("Approved. They joined as a student.") : t("Request declined."), "success"); void requests.reload(); }
    catch (e) { showToast(messageOf(e, t("Unable to review this request.")), "error"); }
  };
  const resend = async (id: number) => {
    try { setIssued(await orgApi.resend(token!, orgId, id)); void invitations.reload(); }
    catch (e) { showToast(messageOf(e, t("Unable to create a new link.")), "error"); }
  };
  const revoke = async () => {
    if (revoking === null) return;
    try { await orgApi.revoke(token!, orgId, revoking); showToast(t("Invitation revoked."), "success"); setRevoking(null); void invitations.reload(); }
    catch (e) { showToast(messageOf(e, t("Unable to revoke.")), "error"); }
  };

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="section-kicker">{t("Invitations")}</p>
          <h1>{t("Invitations & requests")}</h1>
          <p>{isAdmin ? t("Invite teachers and students, and approve people asking to join.") : t("Invitations you sent to students.")}</p>
        </div>
        <button className="button button-primary" onClick={() => setInviting(true)}><MailPlus /> {t("New invitation")}</button>
      </div>

      {isAdmin ? (
        <article className="workspace-panel">
          <div className="panel-head"><h2>{t("Asking to join")} {requests.data?.length ? `(${requests.data.length})` : ""}</h2></div>
          {requests.error ? <ErrorNote message={requests.error} onRetry={() => void requests.reload()} /> : !requests.data || requests.data.length === 0 ? <p className="inline-empty">{t("No one is waiting. People can ask to join with your organization code.")}</p> : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>{t("Person")}</th><th>{t("Message")}</th><th>{t("Requested")}</th><th></th></tr></thead>
                <tbody>
                  {requests.data.map((r) => (
                    <tr key={r.id}>
                      <td><strong>{r.user.name}</strong><div className="meta">{r.user.email}</div></td>
                      <td>{r.message ?? <span className="meta">-</span>}</td><td>{formatRelativeTime(r.createdAt)}</td>
                      <td><div className="org-row-actions">
                        <button className="button button-primary" onClick={() => void review(r.id, true)}><Check /> {t("Approve as student")}</button>
                        <button className="button button-secondary" onClick={() => void review(r.id, false)}><X /> {t("Decline")}</button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      ) : null}

      <article className="workspace-panel">
        <div className="panel-head"><h2>{t("Sent invitations")}</h2></div>
        {invitations.error ? <ErrorNote message={invitations.error} onRetry={() => void invitations.reload()} /> : invitations.isLoading && !invitations.data ? <p className="auth-hint">{t("Loading...")}</p> : !invitations.data || invitations.data.length === 0 ? (
          <PageState compact icon={MailPlus} title={t("No invitations yet")} message={t("Email delivery is not configured, so each invitation gives you a secure link to copy and send yourself.")} />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>{t("Email")}</th><th>{t("Role")}</th><th>{t("Group")}</th><th>{t("Status")}</th><th>{t("Expires")}</th><th></th></tr></thead>
              <tbody>
                {invitations.data.map((i) => (
                  <tr key={i.id}>
                    <td>{i.email}</td><td><Badge value={i.role} /></td><td>{i.groupName ?? "-"}</td><td><Badge value={i.status} /></td><td>{formatDate(i.expiresAt)}</td>
                    <td>
                      {i.status === "PENDING" ? (
                        <div className="org-row-actions">
                          <button className="button button-secondary" onClick={() => void resend(i.id)}><RefreshCw /> {t("New link")}</button>
                          <button className="icon-button" aria-label={t("Revoke invitation for {{email}}", { email: i.email })} onClick={() => setRevoking(i.id)}><Trash2 /></button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      {inviting ? <InviteModal prefill={invitePrefill === "TEACHER" ? "TEACHER" : "STUDENT"} onClose={closeInvite} onIssued={(inv) => { closeInvite(); setIssued(inv); void invitations.reload(); }} /> : null}
      {issued ? (
        <Modal title={t("Invitation link ready")} onClose={() => setIssued(null)}>
          <p className="meta">
            <Trans
              i18nKey="Email delivery is not configured on this platform, so send this link to <b>{{email}}</b> yourself. It works once, only for that email address, and expires {{date}}. It will not be shown again."
              values={{ email: issued.email, date: formatDate(issued.expiresAt) }}
              components={{ b: <strong /> }}
            />
          </p>
          <CopyField value={issued.url} label={t("Invitation link")} />
          <div className="form-actions"><button className="button button-primary" onClick={() => setIssued(null)}>{t("Done")}</button></div>
        </Modal>
      ) : null}
      {revoking !== null ? <ConfirmDialog title={t("Revoke this invitation?")} message={t("The link stops working immediately.")} confirmLabel={t("Revoke")} onConfirm={() => void revoke()} onCancel={() => setRevoking(null)} /> : null}
    </section>
  );
}

function InviteModal({ prefill, onClose, onIssued }: { prefill: OrgRole; onClose: () => void; onIssued: (invitation: IssuedInvitation) => void }) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { orgId, role: myRole } = useOrg();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>(myRole === "ADMIN" ? prefill : "STUDENT");
  const [groupId, setGroupId] = useState("");
  const groups = useAsync(() => orgApi.groups(token!, orgId, { pageSize: 100, status: "ACTIVE" }), [token, orgId]);

  return (
    <FormModal title={t("Invite someone")} submitLabel={t("Create invitation link")} onClose={onClose} wide
      onSubmit={async () => onIssued(await orgApi.invite(token!, orgId, { email, role, groupId: groupId ? Number(groupId) : undefined }))}>
      <Field label={t("Email address")} hint={t("They must sign in with this exact email to accept.")}><input className="auth-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Field>
      {myRole === "ADMIN" ? (
        <Field label={t("Role in this organization")}>
          <select className="auth-input filter-select" value={role} onChange={(e) => { setRole(e.target.value as OrgRole); if (e.target.value !== "STUDENT") setGroupId(""); }}>
            <option value="TEACHER">{t("Teacher")}</option><option value="STUDENT">{t("Student")}</option><option value="ADMIN">{t("Administrator")}</option>
          </select>
        </Field>
      ) : <p className="meta">{t("Teachers can invite students into a group they manage.")}</p>}
      {role === "STUDENT" ? (
        <Field label={myRole === "ADMIN" ? t("Add to a group (optional)") : t("Group")} hint={t("The student joins this group as soon as they accept.")}>
          <select className="auth-input filter-select" value={groupId} onChange={(e) => setGroupId(e.target.value)} required={myRole !== "ADMIN"}>
            <option value="">{myRole === "ADMIN" ? t("No group") : t("Choose a group")}</option>
            {groups.data?.items.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </Field>
      ) : null}
    </FormModal>
  );
}
