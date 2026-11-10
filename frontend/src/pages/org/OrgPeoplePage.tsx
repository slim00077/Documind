import { useState } from "react";
import { Link } from "react-router-dom";
import { GraduationCap, MailPlus, Search, UserPlus, UserSquare2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { orgApi, type Member, type MembershipStatus, type OrgRole, type StudentRow } from "../../services/organizations.api";
import { PageState } from "../../components/ui/PageState";
import ConfirmDialog from "../../components/documents/ConfirmDialog";
import { useToast } from "../../components/ui/ToastProvider";
import { Badge, ErrorNote, Field, FormModal, Pagination, formatDate, messageOf, useAsync, useDebounced } from "../../components/org/OrgUi";
import { useOrg } from "./OrgLayout";

type Kind = "TEACHER" | "STUDENT";

/**
 * Teachers / Students directory. Administrators manage memberships; a teacher only gets a
 * read-only list of the students in the groups they teach.
 */
export default function OrgPeoplePage({ kind }: { kind: Kind }) {
  const { role } = useOrg();
  return role === "ADMIN" ? <AdminPeople kind={kind} /> : <TeacherStudents />;
}

function AdminPeople({ kind }: { kind: Kind }) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { orgId } = useOrg();
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | MembershipStatus>("");
  const debounced = useDebounced(search);
  const [adding, setAdding] = useState(false);
  const [target, setTarget] = useState<{ member: Member; action: "SUSPENDED" | "ACTIVE" | "REMOVED" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmError, setConfirmError] = useState("");

  const { data, error, isLoading, reload } = useAsync(
    () => orgApi.members(token!, orgId, { role: kind, page, pageSize: 15, search: debounced, status: status || undefined }),
    [token, orgId, kind, page, debounced, status],
  );
  const isTeacher = kind === "TEACHER";

  const confirm = async () => {
    if (!target) return;
    setBusy(true);
    setConfirmError("");
    try {
      if (target.action === "REMOVED") await orgApi.removeMember(token!, orgId, target.member.membershipId);
      else await orgApi.updateMember(token!, orgId, target.member.membershipId, { status: target.action });
      showToast(t("Membership updated."), "success");
      setTarget(null);
      void reload();
    } catch (e) {
      setConfirmError(messageOf(e, t("Unable to update this membership.")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="section-kicker">{t("People")}</p>
          <h1>{isTeacher ? t("Teachers") : t("Students")}</h1>
          <p>{isTeacher ? t("Teachers who can create and lead groups in this organization.") : t("Students who belong to this organization.")}</p>
        </div>
        <div className="org-actions">
          <Link className="button button-secondary" to={`/org/${orgId}/invitations?invite=${kind}`}><MailPlus /> {isTeacher ? t("Invite teacher") : t("Invite student")}</Link>
          <button className="button button-primary" type="button" onClick={() => setAdding(true)}><UserPlus /> {t("Add existing account")}</button>
        </div>
      </div>

      <div className="admin-table-toolbar">
        <label className="search-field" style={{ flex: "1 1 260px" }}>
          <Search />
          <input type="search" placeholder={t("Search by name or email")} aria-label={isTeacher ? t("Search teachers") : t("Search students")} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </label>
        <select className="auth-input filter-select" aria-label={t("Filter by status")} value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1); }}>
          <option value="">{t("Active and suspended")}</option>
          <option value="ACTIVE">{t("Active")}</option>
          <option value="SUSPENDED">{t("Suspended")}</option>
          <option value="REMOVED">{t("Removed")}</option>
        </select>
      </div>

      {error ? <ErrorNote message={error} onRetry={() => void reload()} /> : isLoading && !data ? <p className="auth-hint">{t("Loading...")}</p> : !data || data.items.length === 0 ? (
        <PageState icon={isTeacher ? UserSquare2 : GraduationCap} title={isTeacher ? t("No teachers found") : t("No students found")} message={search || status ? t("Try a different search or filter.") : t("Add an existing account or send an invitation to get started.")} />
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>{t("Name")}</th><th>{t("Email")}</th><th>{t("Status")}</th><th>{isTeacher ? t("Groups taught") : t("Groups")}</th><th>{t("Joined")}</th><th></th></tr></thead>
              <tbody>
                {data.items.map((m) => (
                  <tr key={m.membershipId}>
                    <td><strong>{m.name}</strong></td>
                    <td>{m.email}</td>
                    <td><Badge value={m.status} /></td>
                    <td>{m.groupCount}</td>
                    <td>{formatDate(m.joinedAt)}</td>
                    <td>
                      <div className="org-row-actions">
                        {m.status === "ACTIVE" ? <button className="button button-secondary" onClick={() => setTarget({ member: m, action: "SUSPENDED" })}>{t("Suspend")}</button> : null}
                        {m.status === "SUSPENDED" || m.status === "REMOVED" ? <button className="button button-secondary" onClick={() => setTarget({ member: m, action: "ACTIVE" })}>{t("Reactivate")}</button> : null}
                        {m.status !== "REMOVED" ? <button className="button button-danger-ghost" onClick={() => setTarget({ member: m, action: "REMOVED" })}>{t("Remove")}</button> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
        </>
      )}

      {adding ? <AddMemberModal kind={kind} onClose={() => setAdding(false)} onDone={() => { setAdding(false); void reload(); }} /> : null}
      {target ? (
        <ConfirmDialog
          title={target.action === "REMOVED"
            ? t("Remove {{name}}?", { name: target.member.name })
            : target.action === "SUSPENDED"
              ? t("Suspend {{name}}?", { name: target.member.name })
              : t("Reactivate {{name}}?", { name: target.member.name })}
          message={target.action === "ACTIVE"
            ? t("They regain access to this organization.")
            : target.action === "SUSPENDED"
              ? t("They immediately lose access to this organization's groups and shared documents. You can reactivate them later.")
              : t("They lose access to this organization, group memberships end and documents they shared stop being shared. Their personal documents are not affected.")}
          confirmLabel={target.action === "REMOVED" ? t("Remove") : target.action === "SUSPENDED" ? t("Suspend") : t("Reactivate")}
          isBusy={busy} error={confirmError} onConfirm={() => void confirm()} onCancel={() => { setTarget(null); setConfirmError(""); }}
        />
      ) : null}
    </section>
  );
}

function AddMemberModal({ kind, onClose, onDone }: { kind: Kind; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { orgId } = useOrg();
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>(kind);
  return (
    <FormModal title={t("Add an existing account")} submitLabel={t("Add to organization")} onClose={onClose}
      onSubmit={async () => { await orgApi.addMember(token!, orgId, { email, role }); showToast(t("Added to the organization."), "success"); onDone(); }}>
      <Field label={t("Account email")} hint={t("The person must already have a DocuMind account. Otherwise send an invitation.")}>
        <input className="auth-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
      </Field>
      <Field label={t("Role in this organization")}>
        <select className="auth-input filter-select" value={role} onChange={(e) => setRole(e.target.value as OrgRole)}>
          <option value="TEACHER">{t("Teacher")}</option><option value="STUDENT">{t("Student")}</option><option value="ADMIN">{t("Administrator")}</option>
        </select>
      </Field>
    </FormModal>
  );
}

function TeacherStudents() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { orgId } = useOrg();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search);
  const { data, error, isLoading, reload } = useAsync(() => orgApi.students(token!, orgId, { page, pageSize: 15, search: debounced }), [token, orgId, page, debounced]);

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div><p className="section-kicker">{t("People")}</p><h1>{t("My students")}</h1><p>{t("Students in the groups you teach.")}</p></div>
      </div>
      <label className="search-field">
        <Search />
        <input type="search" placeholder={t("Search by name or email")} aria-label={t("Search students")} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </label>
      {error ? <ErrorNote message={error} onRetry={() => void reload()} /> : isLoading && !data ? <p className="auth-hint">{t("Loading...")}</p> : !data || data.items.length === 0 ? (
        <PageState icon={GraduationCap} title={t("No students yet")} message={t("Students appear here once they join one of your groups.")} />
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>{t("Name")}</th><th>{t("Email")}</th><th>{t("Groups")}</th><th>{t("Joined")}</th></tr></thead>
              <tbody>
                {data.items.map((s: StudentRow) => (
                  <tr key={s.userId}>
                    <td><strong>{s.name}</strong></td><td>{s.email}</td>
                    <td>{s.groups.map((g) => <Link key={g.id} className="org-chip" to={`/org/${orgId}/groups/${g.id}`}>{g.name}</Link>)}</td>
                    <td>{formatDate(s.groups[0]?.joinedAt ?? s.joinedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
        </>
      )}
    </section>
  );
}
