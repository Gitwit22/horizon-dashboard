import { Coins } from "lucide-react";
import { useCostBreakdown } from "@/hooks/useHorizonData";
import { LoadingState, EmptyState } from "@/components/DataStates";

export function CostBreakdown() {
  const { data: projects, loading } = useCostBreakdown();

  if (loading) return <LoadingState label="Loading costs..." />;
  if (!projects || projects.length === 0) return <EmptyState label="No cost data available." />;

  const maxCost = Math.max(...projects.map((p) => p.total), 0.01);
  const totalAll = projects.reduce((s, p) => s + p.total, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Coins className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">Cost by Project</h2>
        <span className="text-xs font-mono text-primary ml-auto">${totalAll.toFixed(2)} today</span>
      </div>
      <div className="space-y-3">
        {projects.map((p) => (
          <div key={p.name} className="rounded-lg border border-border bg-card p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">{p.name}</span>
              <span className="text-sm font-mono font-bold text-foreground">${p.total.toFixed(2)}</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-primary/50 rounded-full" style={{ width: `${(p.total / maxCost) * 100}%` }} />
            </div>
            <div className="flex gap-3 flex-wrap">
              {p.breakdown.map((b) => (
                <span key={b.provider} className="text-[10px] text-muted-foreground">
                  {b.provider}: {b.label || `$${b.cost.toFixed(2)}`}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
