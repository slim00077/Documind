import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, MailPlus, RefreshCw, Trash2, X } from "lucide-react";
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
    try { await orgApi.reviewJoinRequest(token!, orgId, id, approve); showToast(approve ? "Approved. They joined as a student." : "Request declined.", "success"); void requests.reload(); }
    catch (e) { showToast(messageOf(e, "Unable to review this request."), "error"); }
  };
  const resend = async (id: number) => {
    try { setIssued(await orgApi.resend(token!, orgId, id)); void invitations.reload(); }
    catch (e) { showToast(messageOf(e, "Unable to create a new link."), "error"); }
  };
  const revoke = async () => {
    if (revoking === null) return;
    try { await orgApi.revoke(token!, orgId, revoking); showToast("Invitation revoked.", "success"); setRevoking(null); void invitations.reload(); }
    catch (e) { showToast(messageOf(e, "Unable to revoke."), "error"); }
  };

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="section-kicker">Invitations</p>
          <h1>Invitations &amp; requests</h1>
          <p>{isAdmin ? "Invite teachers and students, and approve people asking to join." : "Invitations you sent to students."}</p>
        </div>
        <button className="button button-primary" onClick={() => setInviting(true)}><MailPlus /> New invitation</button>
      </div>

      {isAdmin ? (
        <article className="workspace-panel">
          <div className="panel-head"><h2>Asking to join {requests.data?.length ? `(${requests.data.length})` : ""}</h2></div>
          {requests.error ? <ErrorNote message={requests.error} onRetry={() => void requests.reload()} /> : !requests.data || requests.data.length === 0 ? <p className="inline-empty">No one is waiting. People can ask to join with your organization code.</p> : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>Person</th><th>Message</th><th>Requested</th><th></th></tr></thead>
                <tbody>
                  {requests.data.map((r) => (
                    <tr key={r.id}>
                      <td><strong>{r.user.name}</strong><div className="meta">{r.user.email}</div></td>
                      <td>{r.message ?? <span className="meta">-</span>}</td><td>{formatRelativeTime(r.createdAt)}</td>
                      <td><div className="org-row-actions">
                        <button className="button button-primary" onClick={() => void review(r.id, true)}><Check /> Approve as student</button>
                        <button className="button button-secondary" onClick={() => void review(r.id, false)}><X /> Decline</button>
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
        <div className="panel-head"><h2>Sent invitations</h2></div>
        {invitations.error ? <ErrorNote message={invitations.error} onRetry={() => void invitations.reload()} /> : invitations.isLoading && !invitations.data ? <p className="auth-hint">Loading...</p> : !invitations.data || invitations.data.length === 0 ? (
          <PageState compact icon={MailPlus} title="No invitations yet" message="Email delivery is not configured, so each invitation gives you a secure link to copy and send yourself." />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Email</th><th>Role</th><th>Group</th><th>Status</th><th>Expires</th><th></th></tr></thead>
              <tbody>
                {invitations.data.map((i) => (
                  <tr key={i.id}>
                    <td>{i.email}</td><td><Badge value={i.role} /></td><td>{i.groupName ?? "-"}</td><td><Badge value={i.status} /></td><td>{formatDate(i.expiresAt)}</td>
                    <td>
                      {i.status === "PENDING" ? (
                        <div className="org-row-actions">
                          <button className="button button-secondary" onClick={() => void resend(i.id)}><RefreshCw /> New link</button>
                          <button className="icon-button" aria-label={`Revoke invitation for ${i.email}`} onClick={() => setRevoking(i.id)}><Trash2 /></button>
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
        <Modal title="Invitation link ready" onClose={() => setIssued(null)}>
          <p className="meta">Email delivery is not configured on this platform, so send this link to <strong>{issued.email}</strong> yourself. It works once, only for that email address, and expires {formatDate(issued.expiresAt)}. It will not be shown again.</p>
          <CopyField value={issued.url} label="Invitation link" />
          <div className="form-actions"><button className="button button-primary" onClick={() => setIssued(null)}>Done</button></div>
        </Modal>
      ) : null}
      {revoking !== null ? <ConfirmDialog title="Revoke this invitation?" message="The link stops working immediately." confirmLabel="Revoke" onConfirm={() => void revoke()} onCancel={() => setRevoking(null)} /> : null}
    </section>
  );
}

function InviteModal({ prefill, onClose, onIssued }: { prefill: OrgRole; onClose: () => void; onIssued: (invitation: IssuedInvitation) => void }) {
  const { token } = useAuth();
  const { orgId, role: myRole } = useOrg();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>(myRole === "ADMIN" ? prefill : "STUDENT");
  const [groupId, setGroupId] = useState("");
  const groups = useAsync(() => orgApi.groups(token!, orgId, { pageSize: 100, status: "ACTIVE" }), [token, orgId]);

  return (
    <FormModal title="Invite someone" submitLabel="Create invitation link" onClose={onClose} wide
      onSubmit={async () => onIssued(await orgApi.invite(token!, orgId, { email, role, groupId: groupId ? Number(groupId) : undefined }))}>
      <Field label="Email address" hint="They must sign in with this exact email to accept."><input className="auth-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Field>
      {myRole === "ADMIN" ? (
        <Field label="Role in this organization">
          <select className="auth-input filter-select" value={role} onChange={(e) => { setRole(e.target.value as OrgRole); if (e.target.value !== "STUDENT") setGroupId(""); }}>
            <option value="TEACHER">Teacher</option><option value="STUDENT">Student</option><option value="ADMIN">Administrator</option>
          </select>
        </Field>
      ) : <p className="meta">Teachers can invite students into a group they manage.</p>}
      {role === "STUDENT" ? (
        <Field label={myRole === "ADMIN" ? "Add to a group (optional)" : "Group"} hint="The student joins this group as soon as they accept.">
          <select className="auth-input filter-select" value={groupId} onChange={(e) => setGroupId(e.target.value)} required={myRole !== "ADMIN"}>
            <option value="">{myRole === "ADMIN" ? "No group" : "Choose a group"}</option>
            {groups.data?.items.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </Field>
      ) : null}
    </FormModal>
  );
}
