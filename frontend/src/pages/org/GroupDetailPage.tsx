import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Archive, ArchiveRestore, Check, FileText, KeyRound, Pencil, Share2, Trash2, UserPlus, UsersRound, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { DOCUMENTS_API_URL } from "../../config/api";
import { orgApi, type GroupDetail, type Member } from "../../services/organizations.api";
import { PageState } from "../../components/ui/PageState";
import ConfirmDialog from "../../components/documents/ConfirmDialog";
import { useToast } from "../../components/ui/ToastProvider";
import { Badge, CopyField, ErrorNote, Field, FormModal, formatDate, messageOf, useAsync } from "../../components/org/OrgUi";
import { formatRelativeTime } from "../../utils/formatRelativeTime";
import i18n from "../../i18n";
import { useOrg } from "./OrgLayout";

type Tab = "members" | "requests" | "documents" | "settings";

export default function GroupDetailPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { orgId } = useOrg();
  const gid = Number(useParams().groupId);
  const { data: group, error, isLoading, reload } = useAsync<GroupDetail>(() => orgApi.group(token!, gid), [token, gid]);
  const [tab, setTab] = useState<Tab>("members");

  if (error) return <ErrorNote message={error} onRetry={() => void reload()} />;
  if (isLoading || !group) return <p className="auth-hint">{t("Loading group...")}</p>;
  const { canManage, canAdminister } = group.myAccess;
  const archived = group.status === "ARCHIVED";
  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: "members", label: t("Members"), show: true },
    { id: "requests", label: `${t("Requests")}${group.pendingRequests ? ` (${group.pendingRequests})` : ""}`, show: canManage },
    { id: "documents", label: t("Documents"), show: true },
    { id: "settings", label: t("Settings"), show: canManage },
  ];

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="section-kicker"><Link to={`/org/${orgId}/groups`}>{t("Groups")}</Link> / {group.subject ?? t("Group")}</p>
          <h1>{group.name} <Badge value={group.status} /></h1>
          <p>{group.description ?? t("No description.")}{group.academicYear ? ` · ${group.academicYear}` : ""}</p>
        </div>
      </div>
      {archived ? <p className="role-note">{t("This group is archived. Members can still read its documents, but nothing new can be added.")}</p> : null}

      <div className="org-tabs" role="tablist">
        {tabs.filter((item) => item.show).map((item) => (
          <button key={item.id} role="tab" aria-selected={tab === item.id} className={`org-tab ${tab === item.id ? "active" : ""}`} onClick={() => setTab(item.id)}>{item.label}</button>
        ))}
      </div>

      {tab === "members" ? <MembersTab group={group} canManage={canManage} canAdminister={canAdminister} archived={archived} onChange={() => void reload()} /> : null}
      {tab === "requests" && canManage ? <RequestsTab group={group} archived={archived} onChange={() => void reload()} /> : null}
      {tab === "documents" ? <DocumentsTab group={group} canManage={canManage} archived={archived} /> : null}
      {tab === "settings" && canManage ? <SettingsTab group={group} canAdminister={canAdminister} onChange={() => void reload()} /> : null}
    </section>
  );
}

// ---------------------------------------------------------------- members

function MembersTab({ group, canManage, canAdminister, archived, onChange }: { group: GroupDetail; canManage: boolean; canAdminister: boolean; archived: boolean; onChange: () => void }) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { orgId, role } = useOrg();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [addStudent, setAddStudent] = useState(false);
  const [addTeacher, setAddTeacher] = useState(false);
  const [removing, setRemoving] = useState<{ kind: "student" | "teacher"; id: number; name: string } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState("");

  const act = async (fn: () => Promise<unknown>, done: string) => {
    try { await fn(); showToast(done, "success"); setRemoving(null); setLeaving(false); onChange(); } catch (e) { setError(messageOf(e, t("Something went wrong."))); }
  };

  return (
    <div className="dash-grid">
      <article className="workspace-panel">
        <div className="panel-head">
          <h2>{t("Teachers")}</h2>
          {canAdminister && !archived ? <button className="button button-secondary" onClick={() => setAddTeacher(true)}><UserPlus /> {t("Assign teacher")}</button> : null}
        </div>
        <ul className="org-list">
          {group.teachers.map((teacher) => (
            <li key={teacher.id}>
              <span><strong>{teacher.name}</strong> {teacher.role ? <Badge value={teacher.role} /> : null}{teacher.email ? <span className="meta"> {teacher.email}</span> : null}</span>
              {canAdminister && (teacher.role !== "LEAD_TEACHER" || role === "ADMIN") ? <button className="icon-button" aria-label={t("Remove {{name}}", { name: teacher.name })} onClick={() => setRemoving({ kind: "teacher", id: teacher.id, name: teacher.name })}><Trash2 /></button> : null}
            </li>
          ))}
          {group.teachers.length === 0 ? <li><span className="meta">{t("No teacher assigned yet.")}</span></li> : null}
        </ul>
        {!canManage ? (
          <div className="form-actions"><button className="button button-danger-ghost" onClick={() => setLeaving(true)}>{t("Leave group")}</button></div>
        ) : null}
      </article>

      {canManage ? (
        <article className="workspace-panel">
          <div className="panel-head">
            <h2>{t("Students ({{count}})", { count: group.students?.length ?? 0 })}</h2>
            {!archived ? <button className="button button-primary" onClick={() => setAddStudent(true)}><UserPlus /> {t("Add student")}</button> : null}
          </div>
          {!group.students || group.students.length === 0 ? <p className="inline-empty">{t("No students yet. Add one, or share the group code.")}</p> : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>{t("Name")}</th><th>{t("Email")}</th><th>{t("Joined")}</th><th></th></tr></thead>
                <tbody>
                  {group.students.map((s) => (
                    <tr key={s.id}>
                      <td><strong>{s.name}</strong></td><td>{s.email}</td><td>{formatDate(s.joinedAt)}</td>
                      <td><button className="icon-button" aria-label={t("Remove {{name}}", { name: s.name })} onClick={() => setRemoving({ kind: "student", id: s.id, name: s.name })}><Trash2 /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      ) : (
        <article className="workspace-panel">
          <div className="panel-head"><h2>{t("About this group")}</h2></div>
          <p className="meta">{t("You are a member of this group. Documents your teachers share appear in the Documents tab.")}</p>
        </article>
      )}

      {addStudent ? <AddStudentModal group={group} onClose={() => setAddStudent(false)} onDone={() => { setAddStudent(false); showToast(t("Student added."), "success"); onChange(); }} /> : null}
      {addTeacher ? <AssignTeacherModal group={group} onClose={() => setAddTeacher(false)} onDone={() => { setAddTeacher(false); showToast(t("Teacher assigned."), "success"); onChange(); }} /> : null}
      {removing ? (
        <ConfirmDialog title={t("Remove {{name}}?", { name: removing.name })} confirmLabel={t("Remove")} error={error}
          message={removing.kind === "student" ? t("They immediately lose access to this group's documents.") : t("They will no longer manage this group.")}
          onConfirm={() => void act(() => (removing.kind === "student" ? orgApi.removeStudent(token!, group.id, removing.id) : orgApi.unassignTeacher(token!, group.id, removing.id)), t("Removed."))}
          onCancel={() => { setRemoving(null); setError(""); }} />
      ) : null}
      {leaving ? (
        <ConfirmDialog title={t("Leave this group?")} message={t("You will lose access to its shared documents. You can ask to join again later.")} confirmLabel={t("Leave")} error={error}
          onConfirm={() => void act(async () => { await orgApi.leaveGroup(token!, group.id); navigate(`/org/${orgId}/groups`); }, t("You left the group."))}
          onCancel={() => { setLeaving(false); setError(""); }} />
      ) : null}
    </div>
  );
}

function AddStudentModal({ group, onClose, onDone }: { group: GroupDetail; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { orgId } = useOrg();
  const [search, setSearch] = useState("");
  const [pick, setPick] = useState("");
  const students = useAsync(() => orgApi.students(token!, orgId, { pageSize: 100, search }), [token, orgId, search]);
  const inGroup = new Set(group.students?.map((s) => s.id));
  // Teachers only see students of their own groups through the directory; admins see everyone.
  const options = (students.data?.items ?? []).filter((s) => !inGroup.has(s.userId));
  return (
    <FormModal title={t("Add a student")} submitLabel={t("Add to group")} onClose={onClose} onSubmit={async () => { await orgApi.addStudent(token!, group.id, Number(pick)); onDone(); }}>
      <Field label={t("Find a student in this organization")}><input className="auth-input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Name or email")} autoFocus /></Field>
      <Field label={t("Student")} hint={t("Only students of this organization can be added. To bring in someone new, send an invitation from the Invitations page.")}>
        <select className="auth-input filter-select" size={Math.min(Math.max(options.length, 2), 6)} value={pick} onChange={(e) => setPick(e.target.value)} required>
          {options.map((s) => <option key={s.userId} value={s.userId}>{s.name} ({s.email})</option>)}
        </select>
      </Field>
    </FormModal>
  );
}

function AssignTeacherModal({ group, onClose, onDone }: { group: GroupDetail; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { orgId, role } = useOrg();
  const [pick, setPick] = useState("");
  const [lead, setLead] = useState(false);
  const teachers = useAsync(() => orgApi.members(token!, orgId, { role: "TEACHER", status: "ACTIVE", pageSize: 100 }), [token, orgId]);
  const assigned = new Set(group.teachers.map((teacher) => teacher.id));
  const options = (teachers.data?.items ?? []).filter((member: Member) => !assigned.has(member.userId));
  return (
    <FormModal title={t("Assign a teacher")} submitLabel={t("Assign")} onClose={onClose} onSubmit={async () => { await orgApi.assignTeacher(token!, group.id, Number(pick), lead ? "LEAD_TEACHER" : "CO_TEACHER"); onDone(); }}>
      {role !== "ADMIN" ? <p className="meta">{t("Teachers you add join as co-teachers. Co-teachers can manage students and requests, but cannot edit the group.")}</p> : null}
      <Field label={t("Teacher")}>
        <select className="auth-input filter-select" value={pick} onChange={(e) => setPick(e.target.value)} required>
          <option value="">{t("Choose a teacher")}</option>
          {options.map((member) => <option key={member.userId} value={member.userId}>{member.name} ({member.email})</option>)}
        </select>
      </Field>
      {role === "ADMIN" ? <label className="org-check"><input type="checkbox" checked={lead} onChange={(e) => setLead(e.target.checked)} /><span>{t("Make this person a lead teacher")}</span></label> : null}
    </FormModal>
  );
}

// --------------------------------------------------------------- requests

function RequestsTab({ group, archived, onChange }: { group: GroupDetail; archived: boolean; onChange: () => void }) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { showToast } = useToast();
  const { data, error, isLoading, reload } = useAsync(() => orgApi.groupRequests(token!, group.id), [token, group.id]);

  const review = async (id: number, approve: boolean) => {
    try { await orgApi.reviewGroupRequest(token!, group.id, id, approve); showToast(approve ? t("Student approved.") : t("Request declined."), "success"); void reload(); onChange(); }
    catch (e) { showToast(messageOf(e, t("Unable to review this request.")), "error"); }
  };

  if (error) return <ErrorNote message={error} onRetry={() => void reload()} />;
  if (isLoading || !data) return <p className="auth-hint">{t("Loading requests...")}</p>;
  if (data.length === 0) return <PageState icon={Check} title={t("No pending requests")} message={t("When a student asks to join, you can approve or decline here.")} />;
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead><tr><th>{t("Student")}</th><th>{t("Message")}</th><th>{t("Requested")}</th><th></th></tr></thead>
        <tbody>
          {data.map((r) => (
            <tr key={r.id}>
              <td><strong>{r.student.name}</strong><div className="meta">{r.student.email}</div></td>
              <td>{r.message ?? <span className="meta">-</span>}</td>
              <td>{formatRelativeTime(r.createdAt)}</td>
              <td>
                <div className="org-row-actions">
                  <button className="button button-primary" disabled={archived} onClick={() => void review(r.id, true)}><Check /> {t("Approve")}</button>
                  <button className="button button-secondary" onClick={() => void review(r.id, false)}><X /> {t("Decline")}</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// -------------------------------------------------------------- documents

function DocumentsTab({ group, canManage, archived }: { group: GroupDetail; canManage: boolean; archived: boolean }) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { showToast } = useToast();
  const [sharing, setSharing] = useState(false);
  const { data, error, isLoading, reload } = useAsync(() => orgApi.groupDocuments(token!, group.id), [token, group.id]);

  const unshare = async (id: number) => {
    try { await orgApi.unshareFromGroup(token!, group.id, id); showToast(t("Stopped sharing."), "success"); void reload(); }
    catch (e) { showToast(messageOf(e, t("Unable to stop sharing.")), "error"); }
  };

  return (
    <article className="workspace-panel">
      <div className="panel-head">
        <h2>{t("Shared documents")}</h2>
        {canManage && !archived ? <button className="button button-primary" onClick={() => setSharing(true)}><Share2 /> {t("Share a document")}</button> : null}
      </div>
      {error ? <ErrorNote message={error} onRetry={() => void reload()} /> : isLoading || !data ? <p className="auth-hint">{t("Loading...")}</p> : data.length === 0 ? (
        <PageState compact icon={FileText} title={t("Nothing shared yet")} message={canManage ? t("Share one of your documents so group members can read it and ask the AI about it.") : t("Documents your teachers share will appear here.")} />
      ) : (
        <ul className="org-list">
          {data.map((d) => (
            <li key={d.id}>
              <span><Link to={`/app/documents/${d.id}`}><FileText /> {d.name}</Link> <span className="meta">{t("by {{name}} · {{date}}", { name: d.owner?.name ?? "", date: formatDate(d.sharedAt) })}</span></span>
              {canManage ? <button className="icon-button" aria-label={t("Stop sharing {{name}}", { name: d.name })} onClick={() => void unshare(d.id)}><Trash2 /></button> : null}
            </li>
          ))}
        </ul>
      )}
      {sharing ? <ShareModal group={group} onClose={() => setSharing(false)} onDone={() => { setSharing(false); showToast(t("Document shared with the group."), "success"); void reload(); }} /> : null}
    </article>
  );
}

function ShareModal({ group, onClose, onDone }: { group: GroupDetail; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [pick, setPick] = useState("");
  // Sharing starts from the user's own library, so ask for the personal workspace explicitly.
  const docs = useAsync(async () => {
    const response = await fetch(DOCUMENTS_API_URL, { headers: { Authorization: `Bearer ${token}`, "X-Workspace": "personal" } });
    if (!response.ok) throw new Error(i18n.t("Unable to load your documents."));
    return ((await response.json()) as { id: number; name: string; accessRole: string; status: string }[]).filter((d) => d.accessRole === "OWNER");
  }, [token]);
  return (
    <FormModal title={t("Share with {{name}}", { name: group.name })} submitLabel={t("Share")} onClose={onClose} onSubmit={async () => { await orgApi.shareWithGroup(token!, group.id, Number(pick)); onDone(); }}>
      <p className="meta">{t("Group members get read-only access, including AI search and questions. You stay the owner and can stop sharing at any time.")}</p>
      <Field label={t("Your document")}>
        <select className="auth-input filter-select" value={pick} onChange={(e) => setPick(e.target.value)} required>
          <option value="">{docs.isLoading ? t("Loading...") : t("Choose a document")}</option>
          {docs.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </Field>
    </FormModal>
  );
}

// --------------------------------------------------------------- settings

function SettingsTab({ group, canAdminister, onChange }: { group: GroupDetail; canAdminister: boolean; onChange: () => void }) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { orgId } = useOrg();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const archived = group.status === "ARCHIVED";

  const run = async (fn: () => Promise<unknown>, done: string) => {
    try { await fn(); showToast(done, "success"); onChange(); } catch (e) { showToast(messageOf(e, t("Something went wrong.")), "error"); }
  };

  return (
    <div className="dash-grid">
      <article className="workspace-panel">
        <div className="panel-head"><h2>{t("Join code")}</h2></div>
        <p className="meta">{t("Students of this organization can enter this code to ask to join. You still approve every request.")}</p>
        {group.joinCode ? <CopyField value={group.joinCode} label={t("Group join code")} /> : null}
        <div className="form-actions">
          <button className="button button-secondary" disabled={!canAdminister || archived} onClick={() => void run(() => orgApi.rotateGroupCode(token!, group.id), t("New code generated. The old code no longer works."))}><KeyRound /> {t("Generate a new code")}</button>
        </div>
        {!canAdminister ? <p className="meta">{t("Only the lead teacher or an administrator can change the code.")}</p> : null}
      </article>
      <article className="workspace-panel">
        <div className="panel-head"><h2>{t("Group details")}</h2></div>
        <div className="form-actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
          <button className="button button-secondary" disabled={!canAdminister || archived} onClick={() => setEditing(true)}><Pencil /> {t("Edit details")}</button>
          {archived
            ? <button className="button button-secondary" disabled={!canAdminister} onClick={() => void run(() => orgApi.archiveGroup(token!, group.id, false), t("Group restored."))}><ArchiveRestore /> {t("Restore group")}</button>
            : <button className="button button-danger-ghost" disabled={!canAdminister} onClick={() => setConfirmArchive(true)}><Archive /> {t("Archive group")}</button>}
        </div>
        <p className="meta"><UsersRound /> {t("Archiving makes the group read-only. Members keep reading its documents; no one can join or be added.")}</p>
        {!canAdminister ? <p className="meta">{t("Only the lead teacher or an administrator can edit or archive this group. Co-teachers manage students, requests and documents.")}</p> : null}
      </article>
      {editing ? <EditGroupModal group={group} onClose={() => setEditing(false)} onDone={() => { setEditing(false); onChange(); }} /> : null}
      {confirmArchive ? (
        <ConfirmDialog title={t("Archive this group?")} message={t("Pending requests are closed and no one can join. Members keep read-only access to shared documents. You can restore the group later.")} confirmLabel={t("Archive")}
          onConfirm={() => { setConfirmArchive(false); void run(() => orgApi.archiveGroup(token!, group.id, true), t("Group archived.")); }} onCancel={() => setConfirmArchive(false)} />
      ) : null}
      <p className="meta" style={{ gridColumn: "1 / -1" }}><Link to={`/org/${orgId}/groups`}>{t("Back to groups")}</Link></p>
    </div>
  );
}

function EditGroupModal({ group, onClose, onDone }: { group: GroupDetail; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [name, setName] = useState(group.name);
  const [subject, setSubject] = useState(group.subject ?? "");
  const [year, setYear] = useState(group.academicYear ?? "");
  const [description, setDescription] = useState(group.description ?? "");
  return (
    <FormModal title={t("Edit group")} submitLabel={t("Save")} onClose={onClose} wide onSubmit={async () => { await orgApi.updateGroup(token!, group.id, { name, subject, academicYear: year, description }); onDone(); }}>
      <Field label={t("Name")}><input className="auth-input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} /></Field>
      <div className="org-two-col">
        <Field label={t("Subject")}><input className="auth-input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} /></Field>
        <Field label={t("Academic year")}><input className="auth-input" value={year} onChange={(e) => setYear(e.target.value)} maxLength={40} /></Field>
      </div>
      <Field label={t("Description")}><textarea className="auth-input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} /></Field>
    </FormModal>
  );
}
