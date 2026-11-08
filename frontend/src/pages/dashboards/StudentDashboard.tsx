import { Link } from "react-router-dom";
import { BookOpen, Building2, CheckCircle2, FileText, GraduationCap, MessageSquare, Plus, Search, Users } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { useWorkspaceData } from "../../hooks/useWorkspaceData";
import StatCard from "../../components/ui/StatCard";
import FeatureCard from "../../components/ui/FeatureCard";
import { SkeletonMetricCard } from "../../components/ui/Skeleton";
import { AssistantShortcut, ConversationList, DashboardError, DocumentList, Hello, Panel } from "./DashboardParts";

export default function StudentDashboard() {
  const { user } = useAuth();
  const { memberships } = useWorkspace();
  const { documents, shared, conversations, isLoading, error, reload } = useWorkspaceData();

  if (error) return <DashboardError message={error} onRetry={() => void reload()} />;

  const ready = documents.filter((doc) => doc.status === "READY" || doc.status === "COMPLETED");
  const recent = [...documents].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 5);

  return (
    <div className="page-stack">
      <Hello
        eyebrow="Student dashboard"
        name={user?.name}
        text={documents.length === 0 ? "Upload your first document to start studying with AI." : "Pick up where you left off."}
        actions={
          <>
            <Link className="button button-primary" to="/app/documents"><Plus /> Add document</Link>
            <Link className="button button-secondary" to="/app/search"><Search /> Search</Link>
          </>
        }
      />

      {isLoading ? (
        <div className="stat-grid">{Array.from({ length: 4 }).map((_, i) => <SkeletonMetricCard key={i} />)}</div>
      ) : (
        <div className="stat-grid">
          <StatCard icon={FileText} label="My documents" value={documents.length} hint="In your personal library" />
          <StatCard icon={CheckCircle2} label="Ready to study" value={ready.length} hint="Processed and searchable" />
          <StatCard icon={Users} label="Shared with me" value={shared.length} hint="From teachers and classmates" />
          <StatCard icon={MessageSquare} label="Conversations" value={conversations.length} hint="With the AI assistant" />
        </div>
      )}

      <div className="dash-grid">
        <div className="page-stack">
          <Panel title="Recent documents" to="/app/documents">
            <DocumentList documents={recent} empty="No documents yet. Upload a PDF or text file to get started." />
          </Panel>
          <Panel title="Shared with me" to="/app/documents?tab=shared">
            <DocumentList documents={shared.slice(0, 4)} icon={Users} empty="Nothing has been shared with you yet." />
          </Panel>
        </div>
        <div className="page-stack">
          <AssistantShortcut />
          <Panel title="Recent conversations" to="/app/assistant">
            <ConversationList conversations={conversations.slice(0, 4)} />
          </Panel>
        </div>
      </div>

      <div className="feature-grid">
        <FeatureCard icon={GraduationCap} title="Study questions" text="Generate study questions with answers from any of your documents." to="/app/study" action="Open study tools" />
        <FeatureCard icon={BookOpen} title="Summaries" text="Get a short, standard or detailed summary of a long document." to="/app/study" action="Summarize" />
        {memberships.length === 0 ? (
          <FeatureCard icon={Building2} tone="lavender" title="Join an organization" text="Optional. Join your school, university or company with a code or invitation to collaborate in groups." to="/app/join" action="Join an organization" />
        ) : null}
      </div>
    </div>
  );
}
