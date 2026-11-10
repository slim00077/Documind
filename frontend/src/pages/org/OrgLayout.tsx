import { useEffect } from "react";
import { Navigate, Outlet, useOutletContext, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "../../context/WorkspaceContext";
import type { OrgRole, OrgSummary } from "../../services/organizations.api";

export type OrgOutlet = { orgId: number; role: OrgRole; org: OrgSummary & { hasLogo: boolean } };
export const useOrg = () => useOutletContext<OrgOutlet>();

/**
 * Resolves /org/:orgId against the caller's own memberships (a foreign or stale id just redirects),
 * keeps the active workspace in sync with the URL, and gates by organization role.
 */
export default function OrgLayout({ allow }: { allow?: OrgRole[] }) {
  const { t } = useTranslation();
  const { orgId } = useParams();
  const id = Number(orgId);
  const { memberships, current, selectOrg, isLoading } = useWorkspace();
  const membership = memberships.find((m) => m.organization.id === id);

  useEffect(() => {
    if (membership && current?.organization.id !== id) selectOrg(id);
  }, [membership, current, id, selectOrg]);

  if (isLoading) return <p className="auth-hint">{t("Loading your organization...")}</p>;
  if (!membership) return <Navigate to="/app/dashboard" replace />;
  if (allow && !allow.includes(membership.role)) return <Navigate to={`/org/${id}`} replace />;

  return <Outlet context={{ orgId: id, role: membership.role, org: membership.organization } satisfies OrgOutlet} />;
}
