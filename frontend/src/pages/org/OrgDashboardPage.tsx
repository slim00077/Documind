import { Link } from "react-router-dom";
import { Compass, FileText, GraduationCap, Inbox, MailPlus, Plus, UserSquare2, UsersRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { orgApi, type StudentOverview, type TeacherOverview, type OrgStats } from "../../services/organizations.api";
import StatCard from "../../components/ui/StatCard";
import FeatureCard from "../../components/ui/FeatureCard";
import { PageState } from "../../components/ui/PageState";
import { Panel, Hello } from "../dashboards/DashboardParts";
import { Badge, ErrorNote, formatDate, useAsync } from "../../components/org/OrgUi";
import { formatRelativeTime } from "../../utils/formatRelativeTime";
import { useOrg } from "./OrgLayout";
import { auditActionName } from "../../config/auditActions";
import { formatNumber } from "../../i18n/format";

export default function OrgDashboardPage() {
  const { role } = useOrg();
  if (role === "ADMIN") return <AdminDashboard />;
  return role === "TEACHER" ? <TeacherDashboard /> : <StudentDashboard />;
}

function AdminDashboard() {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const { orgId, org } = useOrg();
  const { data, error, isLoading, reload } = useAsync<OrgStats>(() => orgApi.stats(token!, orgId), [token, orgId]);

  if (error) return <ErrorNote message={error} onRetry={() => void reload()} />;
  return (
    <section className="page-stack">
      <Hello eyebrow={`${org.name} · ${t("Administrator")}`} name={user?.name.split(" ")[0]} text={t("Everything in this organization at a glance. Only your organization's data is shown here.")}
        actions={<Link className="button button-primary" to={`/org/${orgId}/invitations`}><MailPlus /> {t("Invite people")}</Link>} />
      {isLoading || !data ? <p className="auth-hint">{t("Loading statistics...")}</p> : (
        <>
          <div className="stat-grid">
            <StatCard icon={UserSquare2} label={t("Teachers")} value={data.teachers} hint={t("Active teacher memberships")} />
            <StatCard icon={GraduationCap} label={t("Students")} value={data.students} hint={t("Active student memberships")} />
            <StatCard icon={UsersRound} label={t("Groups")} value={data.groups.active} hint={t("{{count}} archived", { count: data.groups.archived })} />
            <StatCard icon={Inbox} label={t("Pending requests")} value={data.pendingGroupRequests + data.pendingOrgRequests} hint={t("{{groups}} group · {{organization}} organization", { groups: data.pendingGroupRequests, organization: data.pendingOrgRequests })} />
          </div>
          <div className="dash-grid">
            <Panel title={t("Needs your attention")} to={`/org/${orgId}/invitations`} linkLabel={t("Open")}>
              <ul className="org-list">
                <li><span>{t("Pending invitations")}</span><strong>{formatNumber(data.pendingInvitations)}</strong></li>
                <li><span>{t("People waiting to join the organization")}</span><strong>{formatNumber(data.pendingOrgRequests)}</strong></li>
                <li><span>{t("Students waiting for a group")}</span><strong>{formatNumber(data.pendingGroupRequests)}</strong></li>
                <li><span>{t("Suspended memberships")}</span><strong>{formatNumber(data.suspendedMemberships)}</strong></li>
              </ul>
            </Panel>
            <Panel title={t("Shared documents")} to={`/org/${orgId}/analytics`} linkLabel={t("Details")}>
              <ul className="org-list">
                <li><span>{t("Shared with the whole organization")}</span><strong>{formatNumber(data.documents.organizationShared)}</strong></li>
                <li><span>{t("Shared with groups")}</span><strong>{formatNumber(data.documents.groupShared)}</strong></li>
                <li><span>{t("Shared to groups in the last 7 days")}</span><strong>{formatNumber(data.documents.sharedToGroupsLast7Days)}</strong></li>
              </ul>
            </Panel>
          </div>
        </>
      )}
    </section>
  );
}

function TeacherDashboard() {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const { orgId, org } = useOrg();
  const { data, error, isLoading, reload } = useAsync<TeacherOverview>(() => orgApi.teacherOverview(token!, orgId), [token, orgId]);

  if (error) return <ErrorNote message={error} onRetry={() => void reload()} />;
  return (
    <section className="page-stack">
      <Hello eyebrow={`${org.name} · ${t("Teacher")}`} name={user?.name.split(" ")[0]} text={t("Your groups, students and the requests waiting for you.")}
        actions={<Link className="button button-primary" to={`/org/${orgId}/groups?new=1`}><Plus /> {t("New group")}</Link>} />
      {isLoading || !data ? <p className="auth-hint">{t("Loading your groups...")}</p> : (
        <>
          <div className="stat-grid">
            <StatCard icon={UsersRound} label={t("Groups")} value={data.totals.groups} hint={t("{{count}} active", { count: data.totals.activeGroups })} />
            <StatCard icon={GraduationCap} label={t("Students")} value={data.totals.students} hint={t("Across your groups")} />
            <StatCard icon={Inbox} label={t("Pending requests")} value={data.totals.pendingRequests} hint={t("Waiting for a decision")} />
          </div>
          <div className="dash-grid">
            <div className="page-stack">
              <Panel title={t("My groups")} to={`/org/${orgId}/groups`}>
                {data.groups.length === 0 ? <p className="inline-empty">{t("No groups yet. Create your first one.")}</p> : (
                  <ul className="org-list">
                    {data.groups.map((g) => (
                      <li key={g.id}><Link to={`/org/${orgId}/groups/${g.id}`}>{g.name}</Link><span><Badge value={g.status} /> {t("{{count}} students", { count: g.studentCount })}</span></li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title={t("Recent documents shared")}>
                {data.recentDocuments.length === 0 ? <p className="inline-empty">{t("Nothing shared with your groups yet.")}</p> : (
                  <ul className="org-list">
                    {data.recentDocuments.map((d) => (
                      <li key={`${d.id}-${d.group.id}`}><Link to={`/app/documents/${d.id}`}><FileText /> {d.name}</Link><span>{d.group.name} · {formatRelativeTime(d.sharedAt)}</span></li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
            <div className="page-stack">
              <Panel title={t("Quick actions")}>
                <div className="org-actions">
                  <Link className="button button-secondary" to={`/org/${orgId}/requests`}><Inbox /> {t("Review requests")}</Link>
                  <Link className="button button-secondary" to={`/org/${orgId}/students`}><GraduationCap /> {t("Students")}</Link>
                  <Link className="button button-secondary" to="/app/documents"><FileText /> {t("Documents")}</Link>
                </div>
              </Panel>
              <Panel title={t("Recent group activity")}>
                {data.recentActivity.length === 0 ? <p className="inline-empty">{t("No activity yet.")}</p> : (
                  <ul className="org-list">
                    {data.recentActivity.map((a) => (
                      <li key={a.id}><span>{auditActionName(a.action, t)}</span><span>{a.actorName ?? t("Someone")} · {formatRelativeTime(a.createdAt)}</span></li>
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
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const { orgId, org } = useOrg();
  const { data, error, isLoading, reload } = useAsync<StudentOverview>(() => orgApi.studentOverview(token!, orgId), [token, orgId]);

  if (error) return <ErrorNote message={error} onRetry={() => void reload()} />;
  return (
    <section className="page-stack">
      <Hello eyebrow={`${org.name} · ${t("Student")}`} name={user?.name.split(" ")[0]} text={t("Your groups, teachers and what has been shared with you.")}
        actions={<Link className="button button-primary" to={`/org/${orgId}/discover`}><Compass /> {t("Discover groups")}</Link>} />
      {isLoading || !data ? <p className="auth-hint">{t("Loading...")}</p> : (
        <div className="dash-grid">
          <div className="page-stack">
            <Panel title={t("My groups")} to={`/org/${orgId}/groups`}>
              {data.groups.length === 0 ? (
                <PageState compact icon={UsersRound} title={t("You are not in a group yet")} message={t("Find a group in your organization and ask to join.")} action={<Link className="button button-primary" to={`/org/${orgId}/discover`}>{t("Discover groups")}</Link>} />
              ) : (
                <ul className="org-list">
                  {data.groups.map((g) => (
                    <li key={g.id}><Link to={`/org/${orgId}/groups/${g.id}`}>{g.name}</Link><span>{g.teachers.map((teacher) => teacher.name).join(", ") || t("No teacher yet")}</span></li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title={t("Recently shared with me")}>
              {data.recentDocuments.length === 0 ? <p className="inline-empty">{t("No shared documents yet.")}</p> : (
                <ul className="org-list">
                  {data.recentDocuments.map((d) => (
                    <li key={`${d.id}-${d.group.id}`}><Link to={`/app/documents/${d.id}`}><FileText /> {d.name}</Link><span>{d.group.name} · {formatDate(d.sharedAt)}</span></li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
          <div className="page-stack">
            <Panel title={t("Pending requests")}>
              {data.pendingRequests.length === 0 ? <p className="inline-empty">{t("No pending requests.")}</p> : (
                <ul className="org-list">
                  {data.pendingRequests.map((r) => <li key={r.id}><span>{r.group.name}</span><Badge value="PENDING" /></li>)}
                </ul>
              )}
            </Panel>
            <Panel title={t("My teachers")}>
              {data.teachers.length === 0 ? <p className="inline-empty">{t("Join a group to see your teachers.")}</p> : (
                <ul className="org-list">{data.teachers.map((teacher) => <li key={teacher.id}><span>{teacher.name}</span></li>)}</ul>
              )}
            </Panel>
            <FeatureCard icon={FileText} tone="blue" title={t("Personal workspace")} text={t("Your own documents and AI tools are one click away in the workspace switcher.")} to="/app/dashboard" action={t("Open personal workspace")} />
          </div>
        </div>
      )}
    </section>
  );
}
