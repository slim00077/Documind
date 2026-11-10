import { useState } from "react";
import { FileText, GraduationCap, Inbox, MailPlus, UserSquare2, UsersRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { orgApi } from "../../services/organizations.api";
import StatCard from "../../components/ui/StatCard";
import { Panel } from "../dashboards/DashboardParts";
import { ErrorNote, Pagination, formatDate, useAsync } from "../../components/org/OrgUi";
import { useOrg } from "./OrgLayout";
import { auditActionName, auditTargetLabel } from "../../config/auditActions";

/** Real, organization-scoped numbers and the organization's own audit trail. */
export default function OrgAnalyticsPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { orgId } = useOrg();
  const [page, setPage] = useState(1);
  const stats = useAsync(() => orgApi.stats(token!, orgId), [token, orgId]);
  const logs = useAsync(() => orgApi.auditLogs(token!, orgId, { page, pageSize: 15 }), [token, orgId, page]);
  const s = stats.data;

  return (
    <section className="page-stack">
      <div className="page-heading"><div><p className="section-kicker">{t("Analytics")}</p><h1>{t("Organization analytics")}</h1><p>{t("Live numbers for this organization only.")}</p></div></div>
      {stats.error ? <ErrorNote message={stats.error} onRetry={() => void stats.reload()} /> : !s ? <p className="auth-hint">{t("Loading...")}</p> : (
        <>
          <div className="stat-grid">
            <StatCard icon={UserSquare2} label={t("Teachers")} value={s.teachers} />
            <StatCard icon={GraduationCap} label={t("Students")} value={s.students} hint={t("{{count}} administrators", { count: s.admins })} />
            <StatCard icon={UsersRound} label={t("Groups")} value={s.groups.total} hint={`${t("{{count}} active", { count: s.groups.active })} · ${t("{{count}} archived", { count: s.groups.archived })}`} />
            <StatCard icon={UsersRound} label={t("Active memberships")} value={s.activeMemberships} hint={t("{{count}} suspended", { count: s.suspendedMemberships })} />
            <StatCard icon={MailPlus} label={t("Pending invitations")} value={s.pendingInvitations} />
            <StatCard icon={Inbox} label={t("Pending requests")} value={s.pendingGroupRequests + s.pendingOrgRequests} hint={t("{{groups}} group · {{organization}} organization", { groups: s.pendingGroupRequests, organization: s.pendingOrgRequests })} />
            <StatCard icon={FileText} label={t("Shared documents")} value={s.documents.organizationShared + s.documents.groupShared} hint={t("{{organization}} organization-wide · {{groups}} in groups", { organization: s.documents.organizationShared, groups: s.documents.groupShared })} />
            <StatCard icon={FileText} label={t("Shared this week")} value={s.documents.sharedToGroupsLast7Days} hint={t("New group shares, last 7 days")} />
          </div>
        </>
      )}
      <Panel title={t("Activity history")}>
        {logs.error ? <ErrorNote message={logs.error} onRetry={() => void logs.reload()} /> : !logs.data ? <p className="auth-hint">{t("Loading...")}</p> : logs.data.items.length === 0 ? <p className="inline-empty">{t("No activity recorded yet.")}</p> : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>{t("When")}</th><th>{t("Who")}</th><th>{t("Action")}</th><th>{t("Target")}</th></tr></thead>
                <tbody>
                  {logs.data.items.map((l) => (
                    <tr key={l.id}>
                      <td>{formatDate(l.createdAt)}</td>
                      <td>{l.actorName ?? t("System")}<div className="meta">{l.actorEmail}</div></td>
                      <td><span className="audit-action-chip">{auditActionName(l.action, t)}</span></td>
                      <td>{l.targetType ? `${auditTargetLabel(l.targetType, t)} #${l.targetId ?? ""}` : "-"}</td>
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
