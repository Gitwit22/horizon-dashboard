import { Brain, RefreshCw, Clock } from "lucide-react";
import { useMemoryStatus } from "@/hooks/useHorizonData";
import { LoadingState, EmptyState } from "@/components/DataStates";

const iconMap: Record<string, any> = {
  brain: Brain,
  refresh: RefreshCw,
  clock: Clock,
};

export function MemoryStatus() {
  const { data: items, loading } = useMemoryStatus();

  if (loading) return <LoadingState label="Loading memory status..." />;
  if (!items || items.length === 0) return <EmptyState label="No memory data available." />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Brain className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">Memory Status</h2>
      </div>
      <div className="space-y-2">
        {items.map((m) => (
          <div key={m.label} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
            <Brain className={`h-4 w-4 shrink-0 ${m.fresh ? "text-success" : "text-warning"}`} />
            <span className="text-sm text-foreground flex-1">{m.label}</span>
            <span className={`text-xs font-mono ${m.fresh ? "text-success" : "text-warning"}`}>{m.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
