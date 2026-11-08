import { Link } from "react-router-dom";
import { Compass, FileText, GraduationCap, Inbox, MailPlus, Plus, UserSquare2, UsersRound } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { orgApi, type StudentOverview, type TeacherOverview, type OrgStats } from "../../services/organizations.api";
import StatCard from "../../components/ui/StatCard";
import FeatureCard from "../../components/ui/FeatureCard";
import { PageState } from "../../components/ui/PageState";
import { Panel, Hello } from "../dashboards/DashboardParts";
import { Badge, ErrorNote, formatDate, useAsync } from "../../components/org/OrgUi";
import { formatRelativeTime } from "../../utils/formatRelativeTime";
import { useOrg } from "./OrgLayout";

export default function OrgDashboardPage() {
  const { role } = useOrg();
  if (role === "ADMIN") return <AdminDashboard />;
  return role === "TEACHER" ? <TeacherDashboard /> : <StudentDashboard />;
}

function AdminDashboard() {
  const { token, user } = useAuth();
  const { orgId, org } = useOrg();
  const { data, error, isLoading, reload } = useAsync<OrgStats>(() => orgApi.stats(token!, orgId), [token, orgId]);

  if (error) return <ErrorNote message={error} onRetry={() => void reload()} />;
  return (
    <section className="page-stack">
      <Hello eyebrow={`${org.name} · Administrator`} name={user?.name.split(" ")[0]} text="Everything in this organization at a glance. Only your organization's data is shown here."
        actions={<Link className="button button-primary" to={`/org/${orgId}/invitations`}><MailPlus /> Invite people</Link>} />
      {isLoading || !data ? <p className="auth-hint">Loading statistics...</p> : (
        <>
          <div className="stat-grid">
            <StatCard icon={UserSquare2} label="Teachers" value={data.teachers} hint="Active teacher memberships" />
            <StatCard icon={GraduationCap} label="Students" value={data.students} hint="Active student memberships" />
            <StatCard icon={UsersRound} label="Groups" value={data.groups.active} hint={`${data.groups.archived} archived`} />
            <StatCard icon={Inbox} label="Pending requests" value={data.pendingGroupRequests + data.pendingOrgRequests} hint={`${data.pendingGroupRequests} group · ${data.pendingOrgRequests} organization`} />
          </div>
          <div className="dash-grid">
            <Panel title="Needs your attention" to={`/org/${orgId}/invitations`} linkLabel="Open">
              <ul className="org-list">
                <li><span>Pending invitations</span><strong>{data.pendingInvitations}</strong></li>
                <li><span>People waiting to join the organization</span><strong>{data.pendingOrgRequests}</strong></li>
                <li><span>Students waiting for a group</span><strong>{data.pendingGroupRequests}</strong></li>
                <li><span>Suspended memberships</span><strong>{data.suspendedMemberships}</strong></li>
              </ul>
            </Panel>
            <Panel title="Shared documents" to={`/org/${orgId}/analytics`} linkLabel="Details">
              <ul className="org-list">
                <li><span>Shared with the whole organization</span><strong>{data.documents.organizationShared}</strong></li>
                <li><span>Shared with groups</span><strong>{data.documents.groupShared}</strong></li>
                <li><span>Shared to groups in the last 7 days</span><strong>{data.documents.sharedToGroupsLast7Days}</strong></li>
              </ul>
            </Panel>
          </div>
        </>
      )}
    </section>
  );
}

function TeacherDashboard() {
  const { token, user } = useAuth();
  const { orgId, org } = useOrg();
  const { data, error, isLoading, reload } = useAsync<TeacherOverview>(() => orgApi.teacherOverview(token!, orgId), [token, orgId]);

  if (error) return <ErrorNote message={error} onRetry={() => void reload()} />;
  return (
    <section className="page-stack">
      <Hello eyebrow={`${org.name} · Teacher`} name={user?.name.split(" ")[0]} text="Your groups, students and the requests waiting for you."
        actions={<Link className="button button-primary" to={`/org/${orgId}/groups?new=1`}><Plus /> New group</Link>} />
      {isLoading || !data ? <p className="auth-hint">Loading your groups...</p> : (
        <>
          <div className="stat-grid">
            <StatCard icon={UsersRound} label="Groups" value={data.totals.groups} hint={`${data.totals.activeGroups} active`} />
            <StatCard icon={GraduationCap} label="Students" value={data.totals.students} hint="Across your groups" />
            <StatCard icon={Inbox} label="Pending requests" value={data.totals.pendingRequests} hint="Waiting for a decision" />
          </div>
          <div className="dash-grid">
            <div className="page-stack">
              <Panel title="My groups" to={`/org/${orgId}/groups`}>
                {data.groups.length === 0 ? <p className="inline-empty">No groups yet. Create your first one.</p> : (
                  <ul className="org-list">
                    {data.groups.map((g) => (
                      <li key={g.id}><Link to={`/org/${orgId}/groups/${g.id}`}>{g.name}</Link><span><Badge value={g.status} /> {g.studentCount} students</span></li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="Recent documents shared">
                {data.recentDocuments.length === 0 ? <p className="inline-empty">Nothing shared with your groups yet.</p> : (
                  <ul className="org-list">
                    {data.recentDocuments.map((d) => (
                      <li key={`${d.id}-${d.group.id}`}><Link to={`/app/documents/${d.id}`}><FileText /> {d.name}</Link><span>{d.group.name} · {formatRelativeTime(d.sharedAt)}</span></li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
            <div className="page-stack">
              <Panel title="Quick actions">
                <div className="org-actions">
                  <Link className="button button-secondary" to={`/org/${orgId}/requests`}><Inbox /> Review requests</Link>
                  <Link className="button button-secondary" to={`/org/${orgId}/students`}><GraduationCap /> Students</Link>
                  <Link className="button button-secondary" to="/app/documents"><FileText /> Documents</Link>
                </div>
              </Panel>
              <Panel title="Recent group activity">
                {data.recentActivity.length === 0 ? <p className="inline-empty">No activity yet.</p> : (
                  <ul className="org-list">
                    {data.recentActivity.map((a) => (
                      <li key={a.id}><span>{a.action.toLowerCase().replace(/_/g, " ")}</span><span>{a.actorName ?? "Someone"} · {formatRelativeTime(a.createdAt)}</span></li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function StudentDashboard() {
  const { token, user } = useAuth();
  const { orgId, org } = useOrg();
  const { data, error, isLoading, reload } = useAsync<StudentOverview>(() => orgApi.studentOverview(token!, orgId), [token, orgId]);

  if (error) return <ErrorNote message={error} onRetry={() => void reload()} />;
  return (
    <section className="page-stack">
      <Hello eyebrow={`${org.name} · Student`} name={user?.name.split(" ")[0]} text="Your groups, teachers and what has been shared with you."
        actions={<Link className="button button-primary" to={`/org/${orgId}/discover`}><Compass /> Discover groups</Link>} />
      {isLoading || !data ? <p className="auth-hint">Loading...</p> : (
        <div className="dash-grid">
          <div className="page-stack">
            <Panel title="My groups" to={`/org/${orgId}/groups`}>
              {data.groups.length === 0 ? (
                <PageState compact icon={UsersRound} title="You are not in a group yet" message="Find a group in your organization and ask to join." action={<Link className="button button-primary" to={`/org/${orgId}/discover`}>Discover groups</Link>} />
              ) : (
                <ul className="org-list">
                  {data.groups.map((g) => (
                    <li key={g.id}><Link to={`/org/${orgId}/groups/${g.id}`}>{g.name}</Link><span>{g.teachers.map((t) => t.name).join(", ") || "No teacher yet"}</span></li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Recently shared with me">
              {data.recentDocuments.length === 0 ? <p className="inline-empty">No shared documents yet.</p> : (
                <ul className="org-list">
                  {data.recentDocuments.map((d) => (
                    <li key={`${d.id}-${d.group.id}`}><Link to={`/app/documents/${d.id}`}><FileText /> {d.name}</Link><span>{d.group.name} · {formatDate(d.sharedAt)}</span></li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
          <div className="page-stack">
            <Panel title="Pending requests">
              {data.pendingRequests.length === 0 ? <p className="inline-empty">No pending requests.</p> : (
                <ul className="org-list">
                  {data.pendingRequests.map((r) => <li key={r.id}><span>{r.group.name}</span><Badge value="PENDING" /></li>)}
                </ul>
              )}
            </Panel>
            <Panel title="My teachers">
              {data.teachers.length === 0 ? <p className="inline-empty">Join a group to see your teachers.</p> : (
                <ul className="org-list">{data.teachers.map((t) => <li key={t.id}><span>{t.name}</span></li>)}</ul>
              )}
            </Panel>
            <FeatureCard icon={FileText} tone="blue" title="Personal workspace" text="Your own documents and AI tools are one click away in the workspace switcher." to="/app/dashboard" action="Open personal workspace" />
          </div>
        </div>
      )}
    </section>
  );
}
