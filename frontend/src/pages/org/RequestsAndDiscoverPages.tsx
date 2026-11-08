import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Compass, Inbox, KeyRound, Search, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { orgApi, type DiscoverGroup } from "../../services/organizations.api";
import { PageState } from "../../components/ui/PageState";
import { useToast } from "../../components/ui/ToastProvider";
import { Badge, ErrorNote, Field, FormModal, messageOf, useAsync, useDebounced } from "../../components/org/OrgUi";
import { formatRelativeTime } from "../../utils/formatRelativeTime";
import { useOrg } from "./OrgLayout";

/** Teacher/admin inbox: pending join requests across every group they manage. */
export function RequestsPage() {
  const { token } = useAuth();
  const { orgId } = useOrg();
  const { showToast } = useToast();
  const { data, error, isLoading, reload } = useAsync(() => orgApi.inbox(token!, orgId), [token, orgId]);

  const review = async (groupId: number, id: number, approve: boolean) => {
    try { await orgApi.reviewGroupRequest(token!, groupId, id, approve); showToast(approve ? "Student approved." : "Request declined.", "success"); void reload(); }
    catch (e) { showToast(messageOf(e, "Unable to review this request."), "error"); }
  };

  return (
    <section className="page-stack">
      <div className="page-heading"><div><p className="section-kicker">Requests</p><h1>Join requests</h1><p>Students asking to join your groups.</p></div><Link className="button button-secondary" to={`/org/${orgId}/invitations`}>Invite a student</Link></div>
      {error ? <ErrorNote message={error} onRetry={() => void reload()} /> : isLoading || !data ? <p className="auth-hint">Loading...</p> : data.length === 0 ? (
        <PageState icon={Inbox} title="You're all caught up" message="New requests from students appear here, and you are notified when they arrive." />
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Student</th><th>Group</th><th>Message</th><th>Requested</th><th></th></tr></thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.student.name}</strong><div className="meta">{r.student.email}</div></td>
                  <td><Link to={`/org/${orgId}/groups/${r.group.id}`}>{r.group.name}</Link></td>
                  <td>{r.message ?? <span className="meta">-</span>}</td><td>{formatRelativeTime(r.createdAt)}</td>
                  <td><div className="org-row-actions">
                    <button className="button button-primary" onClick={() => void review(r.group.id, r.id, true)}><Check /> Approve</button>
                    <button className="button button-secondary" onClick={() => void review(r.group.id, r.id, false)}><X /> Decline</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Student: browse the groups of their own organization, request to join, enter a code, track requests. */
export function DiscoverGroupsPage() {
  const { token } = useAuth();
  const { orgId } = useOrg();
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search);
  const [asking, setAsking] = useState<DiscoverGroup | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");

  const groups = useAsync(() => orgApi.discoverGroups(token!, orgId, debounced), [token, orgId, debounced]);
  const requests = useAsync(() => orgApi.myGroupRequests(token!, orgId), [token, orgId]);

  const cancel = async (id: number) => {
    try { await orgApi.cancelGroupRequest(token!, id); showToast("Request cancelled.", "success"); void groups.reload(); void requests.reload(); }
    catch (e) { showToast(messageOf(e, "Unable to cancel."), "error"); }
  };
  const joinByCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setCodeError("");
    try { await orgApi.joinGroupByCode(token!, code); setCode(""); showToast("Request sent. A teacher will review it.", "success"); void groups.reload(); void requests.reload(); }
    catch (e) { setCodeError(messageOf(e, "That code did not work.")); }
  };

  return (
    <section className="page-stack">
      <div className="page-heading"><div><p className="section-kicker">Groups</p><h1>Discover groups</h1><p>Find a group in your organization and ask to join. A teacher approves every request.</p></div></div>

      <div className="dash-grid">
        <article className="workspace-panel">
          <div className="panel-head"><h2>Have a code?</h2></div>
          <form className="copy-field" onSubmit={joinByCode}>
            <input className="auth-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Group code from your teacher" aria-label="Group code" required minLength={4} maxLength={32} />
            <button className="button button-primary" type="submit"><KeyRound /> Send request</button>
          </form>
          {codeError ? <p className="auth-error" role="alert">{codeError}</p> : null}
        </article>
        <article className="workspace-panel">
          <div className="panel-head"><h2>My requests</h2></div>
          {!requests.data || requests.data.length === 0 ? <p className="inline-empty">You have not requested any group yet.</p> : (
            <ul className="org-list">
              {requests.data.slice(0, 6).map((r) => (
                <li key={r.id}>
                  <span>{r.group.name}</span>
                  <span><Badge value={r.status} /> {r.status === "PENDING" ? <button className="button button-danger-ghost" onClick={() => void cancel(r.id)}>Cancel</button> : null}</span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>

      <label className="search-field"><Search /><input type="search" placeholder="Search groups by name or subject" aria-label="Search groups" value={search} onChange={(e) => setSearch(e.target.value)} /></label>

      {groups.error ? <ErrorNote message={groups.error} onRetry={() => void groups.reload()} /> : groups.isLoading && !groups.data ? <p className="auth-hint">Loading groups...</p> : !groups.data || groups.data.length === 0 ? (
        <PageState icon={Compass} title="No groups to show" message={search ? "No group matches your search." : "Your organization has no open groups yet."} />
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Group</th><th>Teachers</th><th>Students</th><th></th></tr></thead>
            <tbody>
              {groups.data.map((g) => (
                <tr key={g.id}>
                  <td><strong>{g.name}</strong><div className="meta">{[g.subject, g.academicYear].filter(Boolean).join(" · ") || g.description}</div></td>
                  <td>{g.teachers.map((t) => t.name).join(", ") || "-"}</td><td>{g.studentCount}</td>
                  <td>
                    {g.joined ? <Link className="button button-secondary" to={`/org/${orgId}/groups/${g.id}`}>Open</Link>
                      : g.pendingRequestId ? <Badge value="PENDING" />
                      : <button className="button button-primary" onClick={() => setAsking(g)}>Request to join</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {asking ? (
        <RequestModal group={asking} onClose={() => setAsking(null)} onDone={() => { setAsking(null); showToast("Request sent. A teacher will review it.", "success"); void groups.reload(); void requests.reload(); }} />
      ) : null}
    </section>
  );
}

function RequestModal({ group, onClose, onDone }: { group: DiscoverGroup; onClose: () => void; onDone: () => void }) {
  const { token } = useAuth();
  const [message, setMessage] = useState("");
  return (
    <FormModal title={`Join ${group.name}`} submitLabel="Send request" onClose={onClose} onSubmit={async () => { await orgApi.requestGroup(token!, group.id, message || undefined); onDone(); }}>
      <p className="meta">{group.description ?? "Your request goes to the group's teachers."}</p>
      <Field label="Message (optional)"><textarea className="auth-input" rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Say who you are or why you want to join" /></Field>
    </FormModal>
  );
}
