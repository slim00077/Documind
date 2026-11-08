import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Search, UsersRound } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { orgApi, type GroupRow } from "../../services/organizations.api";
import { PageState } from "../../components/ui/PageState";
import FeatureCard from "../../components/ui/FeatureCard";
import { Badge, ErrorNote, Field, FormModal, Pagination, useAsync, useDebounced } from "../../components/org/OrgUi";
import { useOrg } from "./OrgLayout";

export default function OrgGroupsPage() {
  const { role } = useOrg();
  return role === "STUDENT" ? <StudentGroups /> : <ManagerGroups />;
}

function ManagerGroups() {
  const { token } = useAuth();
  const { orgId, role } = useOrg();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | "ACTIVE" | "ARCHIVED">("");
  const debounced = useDebounced(search);
  const [creating, setCreating] = useState(params.get("new") === "1");

  const { data, error, isLoading, reload } = useAsync(
    () => orgApi.groups(token!, orgId, { page, pageSize: 12, search: debounced, status: status || undefined }),
    [token, orgId, page, debounced, status],
  );
  const closeCreate = () => { setCreating(false); if (params.has("new")) { params.delete("new"); setParams(params, { replace: true }); } };

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <p className="section-kicker">Groups</p>
          <h1>{role === "ADMIN" ? "All groups" : "My groups"}</h1>
          <p>{role === "ADMIN" ? "Every class and cohort in this organization." : "Groups you lead or help teach."}</p>
        </div>
        <button className="button button-primary" type="button" onClick={() => setCreating(true)}><Plus /> New group</button>
      </div>

      <div className="admin-table-toolbar">
        <label className="search-field" style={{ flex: "1 1 260px" }}>
          <Search />
          <input type="search" placeholder="Search groups" aria-label="Search groups" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </label>
        <select className="auth-input filter-select" aria-label="Filter by status" value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1); }}>
          <option value="">All groups</option><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option>
        </select>
      </div>

      {error ? <ErrorNote message={error} onRetry={() => void reload()} /> : isLoading && !data ? <p className="auth-hint">Loading groups...</p> : !data || data.items.length === 0 ? (
        <PageState icon={UsersRound} title="No groups yet" message={search || status ? "No group matches this filter." : "Create a group, then invite students or share its code."}
          action={!search && !status ? <button className="button button-primary" onClick={() => setCreating(true)}><Plus /> Create a group</button> : undefined} />
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Group</th><th>Subject</th><th>Teachers</th><th>Students</th><th>Requests</th><th>Status</th></tr></thead>
              <tbody>
                {data.items.map((g) => (
                  <tr key={g.id} className="org-click-row" onClick={() => navigate(`/org/${orgId}/groups/${g.id}`)}>
                    <td><Link to={`/org/${orgId}/groups/${g.id}`} onClick={(e) => e.stopPropagation()}><strong>{g.name}</strong></Link>{g.academicYear ? <div className="meta">{g.academicYear}</div> : null}</td>
                    <td>{g.subject ?? "-"}</td>
                    <td>{g.teachers.map((t) => t.name).join(", ") || <span className="meta">None assigned</span>}</td>
                    <td>{g.studentCount}</td>
                    <td>{g.pendingRequests ? <Badge value="PENDING" tone="warn" /> : "-"} {g.pendingRequests ? g.pendingRequests : ""}</td>
                    <td><Badge value={g.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
        </>
      )}

      {creating ? <CreateGroupModal onClose={closeCreate} onCreated={(id) => { closeCreate(); navigate(`/org/${orgId}/groups/${id}`); }} /> : null}
    </section>
  );
}

function CreateGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const { token } = useAuth();
  const { orgId, role } = useOrg();
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [year, setYear] = useState("");
  const [description, setDescription] = useState("");
  const [lead, setLead] = useState("");
  const teachers = useAsync(() => (role === "ADMIN" ? orgApi.members(token!, orgId, { role: "TEACHER", status: "ACTIVE", pageSize: 100 }) : Promise.resolve(null)), [token, orgId, role]);

  return (
    <FormModal title="Create a group" submitLabel="Create group" onClose={onClose} wide
      onSubmit={async () => {
        const group = await orgApi.createGroup(token!, orgId, { name, subject: subject || undefined, academicYear: year || undefined, description: description || undefined, leadTeacherId: lead ? Number(lead) : undefined });
        onCreated(group.id);
      }}>
      <Field label="Group name"><input className="auth-input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} autoFocus placeholder="e.g. Biology 101 - Autumn" /></Field>
      <div className="org-two-col">
        <Field label="Subject (optional)"><input className="auth-input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} /></Field>
        <Field label="Academic year (optional)"><input className="auth-input" value={year} onChange={(e) => setYear(e.target.value)} maxLength={40} placeholder="2026-2027" /></Field>
      </div>
      <Field label="Description (optional)"><textarea className="auth-input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} /></Field>
      {role === "ADMIN" ? (
        <Field label="Lead teacher (optional)" hint="You can assign teachers later.">
          <select className="auth-input filter-select" value={lead} onChange={(e) => setLead(e.target.value)}>
            <option value="">No lead teacher yet</option>
            {teachers.data?.items.map((t) => <option key={t.userId} value={t.userId}>{t.name}</option>)}
          </select>
        </Field>
      ) : <p className="meta">You will be the lead teacher of this group.</p>}
    </FormModal>
  );
}

function StudentGroups() {
  const { token } = useAuth();
  const { orgId } = useOrg();
  const { data, error, isLoading, reload } = useAsync<GroupRow[]>(() => orgApi.myGroups(token!, orgId), [token, orgId]);

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div><p className="section-kicker">Groups</p><h1>My groups</h1><p>Groups you belong to in this organization.</p></div>
        <Link className="button button-primary" to={`/org/${orgId}/discover`}>Discover groups</Link>
      </div>
      {error ? <ErrorNote message={error} onRetry={() => void reload()} /> : isLoading || !data ? <p className="auth-hint">Loading...</p> : data.length === 0 ? (
        <PageState icon={UsersRound} title="You are not in a group yet" message="Browse the groups of your organization and send a request to join, or enter a code from your teacher."
          action={<Link className="button button-primary" to={`/org/${orgId}/discover`}>Discover groups</Link>} />
      ) : (
        <div className="feature-strip three">
          {data.map((g, i) => (
            <FeatureCard key={g.id} icon={UsersRound} tone={(["violet", "cyan", "blue", "lavender"] as const)[i % 4]} title={g.name}
              text={`${g.subject ? `${g.subject} · ` : ""}${g.teachers.map((t) => t.name).join(", ") || "No teacher assigned"}${g.status === "ARCHIVED" ? " · Archived" : ""}`}
              to={`/org/${orgId}/groups/${g.id}`} action="Open group" />
          ))}
        </div>
      )}
    </section>
  );
}
