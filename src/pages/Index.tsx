import { useState } from "react";
import { DashboardSidebar } from "@/components/DashboardSidebar";
import { HeartbeatPanel } from "@/components/HeartbeatPanel";
import { RunsTable } from "@/components/RunsTable";
import { RunDetailDrawer } from "@/components/RunDetailDrawer";
import { ProjectStatusPanel } from "@/components/ProjectStatusPanel";
import { SkillExecutionStats } from "@/components/SkillExecutionStats";
import { CostBreakdown } from "@/components/CostBreakdown";
import { AlertCustomization } from "@/components/AlertCustomization";
import { MemoryStatus } from "@/components/MemoryStatus";
import { SubagentQueue } from "@/components/SubagentQueue";
import { ChatPanel } from "@/components/ChatPanel";
import { DocumentUploadPanel } from "@/components/DocumentUploadPanel";
import { Run } from "@/data/mockRuns";

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
            <>
              <ProjectStatusPanel />
              <div className="grid gap-6 lg:grid-cols-2">
                <SkillExecutionStats />
                <CostBreakdown />
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                <MemoryStatus />
                <SubagentQueue />
              </div>
            </>
          )}

          {activeTab === "runs" && (
            <RunsTable onSelectRun={setSelectedRun} />
          )}

          {activeTab === "chat" && (
            <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
              <div className="h-[70vh] min-h-[28rem]">
                <ChatPanel />
              </div>
              <DocumentUploadPanel />
            </div>
          )}

          {activeTab === "heartbeat" && (
            <>
              <HeartbeatPanel />
              <AlertCustomization />
            </>
          )}

          {activeTab === "settings" && (
            <AlertCustomization />
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
