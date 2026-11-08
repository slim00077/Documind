import { useState } from "react";
import { FileText, GraduationCap, Inbox, MailPlus, UserSquare2, UsersRound } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { orgApi } from "../../services/organizations.api";
import StatCard from "../../components/ui/StatCard";
import { Panel } from "../dashboards/DashboardParts";
import { ErrorNote, Pagination, formatDate, useAsync } from "../../components/org/OrgUi";
import { useOrg } from "./OrgLayout";

const label = (action: string) => action.toLowerCase().replace(/_/g, " ");

/** Real, organization-scoped numbers and the organization's own audit trail. */
export default function OrgAnalyticsPage() {
  const { token } = useAuth();
  const { orgId } = useOrg();
  const [page, setPage] = useState(1);
  const stats = useAsync(() => orgApi.stats(token!, orgId), [token, orgId]);
  const logs = useAsync(() => orgApi.auditLogs(token!, orgId, { page, pageSize: 15 }), [token, orgId, page]);
  const s = stats.data;

  return (
    <section className="page-stack">
      <div className="page-heading"><div><p className="section-kicker">Analytics</p><h1>Organization analytics</h1><p>Live numbers for this organization only.</p></div></div>
      {stats.error ? <ErrorNote message={stats.error} onRetry={() => void stats.reload()} /> : !s ? <p className="auth-hint">Loading...</p> : (
        <>
          <div className="stat-grid">
            <StatCard icon={UserSquare2} label="Teachers" value={s.teachers} />
            <StatCard icon={GraduationCap} label="Students" value={s.students} hint={`${s.admins} administrator${s.admins === 1 ? "" : "s"}`} />
            <StatCard icon={UsersRound} label="Groups" value={s.groups.total} hint={`${s.groups.active} active · ${s.groups.archived} archived`} />
            <StatCard icon={UsersRound} label="Active memberships" value={s.activeMemberships} hint={`${s.suspendedMemberships} suspended`} />
            <StatCard icon={MailPlus} label="Pending invitations" value={s.pendingInvitations} />
            <StatCard icon={Inbox} label="Pending requests" value={s.pendingGroupRequests + s.pendingOrgRequests} hint={`${s.pendingGroupRequests} group · ${s.pendingOrgRequests} organization`} />
            <StatCard icon={FileText} label="Shared documents" value={s.documents.organizationShared + s.documents.groupShared} hint={`${s.documents.organizationShared} organization-wide · ${s.documents.groupShared} in groups`} />
            <StatCard icon={FileText} label="Shared this week" value={s.documents.sharedToGroupsLast7Days} hint="New group shares, last 7 days" />
          </div>
        </>
      )}
      <Panel title="Activity history">
        {logs.error ? <ErrorNote message={logs.error} onRetry={() => void logs.reload()} /> : !logs.data ? <p className="auth-hint">Loading...</p> : logs.data.items.length === 0 ? <p className="inline-empty">No activity recorded yet.</p> : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th></tr></thead>
                <tbody>
                  {logs.data.items.map((l) => (
                    <tr key={l.id}>
                      <td>{formatDate(l.createdAt)}</td>
                      <td>{l.actorName ?? "System"}<div className="meta">{l.actorEmail}</div></td>
                      <td><span className="audit-action-chip">{label(l.action)}</span></td>
                      <td>{l.targetType ? `${l.targetType} #${l.targetId ?? ""}` : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={logs.data.page} totalPages={logs.data.totalPages} total={logs.data.total} onPage={setPage} />
          </>
        )}
      </Panel>
    </section>
  );
}
