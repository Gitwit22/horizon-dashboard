import { useState, lazy, Suspense } from "react";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { RunDetailDrawer } from "@/components/RunDetailDrawer";
import { ConnectionControl } from "@/components/ConnectionControl";
import { Loader2 } from "lucide-react";
import type { Run } from "@/types/horizon";

// Lazy-load heavy tab content so the initial bundle stays small
const HeartbeatPanel = lazy(() => import("@/components/HeartbeatPanel").then(m => ({ default: m.HeartbeatPanel })));
const RunsTable = lazy(() => import("@/components/RunsTable").then(m => ({ default: m.RunsTable })));
const ProjectStatusPanel = lazy(() => import("@/components/ProjectStatusPanel").then(m => ({ default: m.ProjectStatusPanel })));
const SkillExecutionStats = lazy(() => import("@/components/SkillExecutionStats").then(m => ({ default: m.SkillExecutionStats })));
const CostBreakdown = lazy(() => import("@/components/CostBreakdown").then(m => ({ default: m.CostBreakdown })));
const AlertCustomization = lazy(() => import("@/components/AlertCustomization").then(m => ({ default: m.AlertCustomization })));
const MemoryStatus = lazy(() => import("@/components/MemoryStatus").then(m => ({ default: m.MemoryStatus })));
const SubagentQueue = lazy(() => import("@/components/SubagentQueue").then(m => ({ default: m.SubagentQueue })));
const ChatPanel = lazy(() => import("@/components/ChatPanel").then(m => ({ default: m.ChatPanel })));
const DocumentUploadPanel = lazy(() => import("@/components/DocumentUploadPanel").then(m => ({ default: m.DocumentUploadPanel })));

function TabFallback() {
  return (
    <div className="flex items-center justify-center py-20 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin mr-2" />
      Loading…
    </div>
  );
}

const Index = () => {
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="flex h-screen bg-background bg-grid">
      <DashboardSidebar active={activeTab} onNavigate={setActiveTab} />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Horizon Console</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {activeTab === "overview" && "Projects, skills, costs, and memory at a glance."}
              {activeTab === "runs" && "Monitor runs, debug steps, track performance."}
              {activeTab === "chat" && "Chat with Horizon and upload supporting documents."}
              {activeTab === "heartbeat" && "Live system health and alerts."}
              {activeTab === "settings" && "Configure alerts and thresholds."}
            </p>
          </div>

          {activeTab === "overview" && (
            <Suspense fallback={<TabFallback />}>
              <ConnectionControl />
              <ProjectStatusPanel />
              <div className="grid gap-6 lg:grid-cols-2">
                <SkillExecutionStats />
                <CostBreakdown />
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                <MemoryStatus />
                <SubagentQueue />
              </div>
            </Suspense>
          )}

          {activeTab === "runs" && (
            <Suspense fallback={<TabFallback />}>
              <RunsTable onSelectRun={setSelectedRun} />
            </Suspense>
          )}

          {activeTab === "chat" && (
            <Suspense fallback={<TabFallback />}>
              <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
                <div className="h-[70vh] min-h-[28rem]">
                  <ChatPanel />
                </div>
                <DocumentUploadPanel />
              </div>
            </Suspense>
          )}

          {activeTab === "heartbeat" && (
            <Suspense fallback={<TabFallback />}>
              <HeartbeatPanel />
              <AlertCustomization />
            </Suspense>
          )}

          {activeTab === "settings" && (
            <Suspense fallback={<TabFallback />}>
              <AlertCustomization />
            </Suspense>
          )}
        </div>
      </main>
      {selectedRun && (
        <RunDetailDrawer run={selectedRun} onClose={() => setSelectedRun(null)} />
      )}
    </div>
  );
};

export default Index;
