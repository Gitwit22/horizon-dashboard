import { useHeartbeat } from "@/hooks/useHorizonData";
import { LoadingState, EmptyState } from "@/components/DataStates";
import { Activity, Clock, AlertTriangle, Zap, BarChart3, CheckCircle } from "lucide-react";

function timeSince(isoString: string) {
  const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function MetricCard({ icon: Icon, label, value, accent = false, warning = false }: {
  icon: any; label: string; value: string | number; accent?: boolean; warning?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-4 ${warning ? 'border-destructive/30 bg-destructive/5' : accent ? 'border-primary/20 bg-primary/5' : 'border-border bg-card'}`}>
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        <Icon className={`h-3.5 w-3.5 ${accent ? 'text-primary' : warning ? 'text-destructive' : ''}`} />
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-2xl font-bold font-mono ${accent ? 'text-primary' : warning ? 'text-destructive' : 'text-foreground'}`}>
        {value}
      </p>
    </div>
  );
}

export function HeartbeatPanel() {
  const { data: d, loading } = useHeartbeat();

  if (loading || !d) return <LoadingState label="Loading heartbeat..." />;

  const lastEventAgo = timeSince(d.lastEventReceived);
  const lastSuccessAgo = timeSince(d.lastSuccessfulRun);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">Live Heartbeat</h2>
        <span className="h-2 w-2 rounded-full bg-success animate-pulse-glow ml-auto" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard icon={Zap} label="Last Event" value={lastEventAgo} accent />
        <MetricCard icon={CheckCircle} label="Last Success" value={lastSuccessAgo} />
        <MetricCard icon={BarChart3} label="Queue Size" value={d.currentQueueSize} />
        <MetricCard icon={Activity} label="Active Runs" value={d.activeRuns} accent />
        <MetricCard icon={Clock} label="Avg Response" value={`${(d.avgResponseTimeMs / 1000).toFixed(1)}s`} />
        <MetricCard icon={BarChart3} label="Runs Today" value={d.totalRunsToday} />
        <MetricCard icon={AlertTriangle} label="Error Rate" value={`${d.errorRatePercent}%`} warning={d.errorRatePercent > 5} />
        <MetricCard icon={AlertTriangle} label="Stuck Threshold" value={`${d.stuckThresholdSeconds}s`} />
      </div>
    </div>
  );
}
