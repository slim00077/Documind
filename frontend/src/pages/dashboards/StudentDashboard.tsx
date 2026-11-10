import { Link } from "react-router-dom";
import { BookOpen, Building2, CheckCircle2, FileText, GraduationCap, MessageSquare, Plus, Search, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { useWorkspaceData } from "../../hooks/useWorkspaceData";
import StatCard from "../../components/ui/StatCard";
import FeatureCard from "../../components/ui/FeatureCard";
import { SkeletonMetricCard } from "../../components/ui/Skeleton";
import { AssistantShortcut, ConversationList, DashboardError, DocumentList, Hello, Panel } from "./DashboardParts";

export default function StudentDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { memberships } = useWorkspace();
  const { documents, shared, conversations, isLoading, error, reload } = useWorkspaceData();

  if (error) return <DashboardError message={error} onRetry={() => void reload()} />;

  const ready = documents.filter((doc) => doc.status === "READY" || doc.status === "COMPLETED");
  const recent = [...documents].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 5);

  return (
    <div className="page-stack">
      <Hello
        eyebrow={t("Student dashboard")}
        name={user?.name}
        text={documents.length === 0 ? t("Upload your first document to start studying with AI.") : t("Pick up where you left off.")}
        actions={
          <>
            <Link className="button button-primary" to="/app/documents"><Plus /> {t("Add document")}</Link>
            <Link className="button button-secondary" to="/app/search"><Search /> {t("Search")}</Link>
          </>
        }
      />

      {isLoading ? (
        <div className="stat-grid">{Array.from({ length: 4 }).map((_, i) => <SkeletonMetricCard key={i} />)}</div>
      ) : (
        <div className="stat-grid">
          <StatCard icon={FileText} label={t("My documents")} value={documents.length} hint={t("In your personal library")} />
          <StatCard icon={CheckCircle2} label={t("Ready to study")} value={ready.length} hint={t("Processed and searchable")} />
          <StatCard icon={Users} label={t("Shared with me")} value={shared.length} hint={t("From teachers and classmates")} />
          <StatCard icon={MessageSquare} label={t("Conversations")} value={conversations.length} hint={t("With the AI assistant")} />
        </div>
      )}

      <div className="dash-grid">
        <div className="page-stack">
          <Panel title={t("Recent documents")} to="/app/documents">
            <DocumentList documents={recent} empty={t("No documents yet. Upload a PDF or text file to get started.")} />
          </Panel>
          <Panel title={t("Shared with me")} to="/app/documents?tab=shared">
            <DocumentList documents={shared.slice(0, 4)} icon={Users} empty={t("Nothing has been shared with you yet.")} />
          </Panel>
        </div>
        <div className="page-stack">
          <AssistantShortcut />
          <Panel title={t("Recent conversations")} to="/app/assistant">
            <ConversationList conversations={conversations.slice(0, 4)} />
          </Panel>
        </div>
      </div>

      <div className="feature-grid">
        <FeatureCard icon={GraduationCap} title={t("Study questions")} text={t("Generate study questions with answers from any of your documents.")} to="/app/study" action={t("Open study tools")} />
        <FeatureCard icon={BookOpen} title={t("Summaries")} text={t("Get a short, standard or detailed summary of a long document.")} to="/app/study" action={t("Summarize")} />
        {memberships.length === 0 ? (
          <FeatureCard icon={Building2} tone="lavender" title={t("Join an organization")} text={t("Optional. Join your school, university or company with a code or invitation to collaborate in groups.")} to="/app/join" action={t("Join an organization")} />
        ) : null}
      </div>
    </div>
  );
}
