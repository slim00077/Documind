import { useState } from "react";
import { Link } from "react-router-dom";
import { Building2, CheckCircle2, FileText, Lightbulb, MessageSquare, Plus, Scale, Sparkles, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { useWorkspaceData } from "../../hooks/useWorkspaceData";
import StatCard from "../../components/ui/StatCard";
import FeatureCard from "../../components/ui/FeatureCard";
import { SkeletonMetricCard } from "../../components/ui/Skeleton";
import { AssistantShortcut, ConversationList, DashboardError, DocumentList, Hello, Panel } from "./DashboardParts";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default function TeacherDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { memberships } = useWorkspace();
  const { documents, shared, conversations, isLoading, error, reload } = useWorkspaceData();
  const [now] = useState(() => Date.now());

  if (error) return <DashboardError message={error} onRetry={() => void reload()} />;

  const byNewest = [...documents].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const thisWeek = documents.filter((doc) => now - +new Date(doc.createdAt) < WEEK_MS);
  const ready = documents.filter((doc) => doc.status === "READY" || doc.status === "COMPLETED");
  const analyzed = documents
    .filter((doc) => doc.insightsGeneratedAt)
    .sort((a, b) => +new Date(b.insightsGeneratedAt!) - +new Date(a.insightsGeneratedAt!))
    .slice(0, 4);

  return (
    <div className="page-stack">
      <Hello
        eyebrow={t("Teacher dashboard")}
        name={user?.name}
        text={t("Manage your documents and put AI to work on them.")}
        actions={
          <>
            <Link className="button button-primary" to="/app/documents"><Plus /> {t("Upload document")}</Link>
            <Link className="button button-secondary" to="/app/compare"><Scale /> {t("Compare")}</Link>
          </>
        }
      />

      {isLoading ? (
        <div className="stat-grid">{Array.from({ length: 4 }).map((_, i) => <SkeletonMetricCard key={i} />)}</div>
      ) : (
        <div className="stat-grid">
          <StatCard icon={FileText} label={t("My documents")} value={documents.length} hint={t("In your workspace")} />
          <StatCard icon={Upload} label={t("Uploaded this week")} value={thisWeek.length} hint={t("Last 7 days")} />
          <StatCard icon={CheckCircle2} label={t("Ready for AI")} value={ready.length} hint={t("Processed and searchable")} />
          <StatCard icon={MessageSquare} label={t("Conversations")} value={conversations.length} hint={t("{{count}} shared with you", { count: shared.length })} />
        </div>
      )}

      <div className="dash-grid">
        <div className="page-stack">
          <Panel title={t("Recent uploads")} to="/app/documents">
            <DocumentList documents={byNewest.slice(0, 5)} empty={t("No documents yet. Upload one to unlock the AI tools.")} />
          </Panel>
          <Panel title={t("Recent AI insights")} to="/app/insights" glass>
            <DocumentList documents={analyzed} icon={Lightbulb} empty={t("No insights generated yet. Open a document and generate its AI insights.")} />
          </Panel>
        </div>
        <div className="page-stack">
          <AssistantShortcut />
          <Panel title={t("Recent conversations")} to="/app/assistant">
            <ConversationList conversations={conversations.slice(0, 4)} />
          </Panel>
        </div>
      </div>

      <div className="panel-head" style={{ marginBottom: 0 }}><h2>{t("AI tools")}</h2><Link to="/app/ai-tools">{t("All tools")}</Link></div>
      <div className="feature-grid">
        <FeatureCard icon={Scale} title={t("Document comparison")} text={t("Compare two documents and see shared and unique content.")} to="/app/compare" action={t("Compare")} />
        <FeatureCard icon={Lightbulb} title={t("Collection insights")} text={t("Themes and related documents across your library.")} to="/app/insights" action={t("Analyze")} />
        <FeatureCard icon={Sparkles} title={t("Summaries & study material")} text={t("Summaries, key information and questions per document.")} to="/app/ai-tools" action={t("Open tools")} />
        {memberships.length === 0 ? (
          <FeatureCard icon={Building2} tone="lavender" title={t("Join an organization")} text={t("Optional. Join your school, university or company with a code or invitation to collaborate in groups.")} to="/app/join" action={t("Join an organization")} />
        ) : null}
      </div>
    </div>
  );
}
