import { Layers } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { useSubagentQueue } from "@/hooks/useHorizonData";
import { LoadingState, EmptyState } from "@/components/DataStates";

export function SubagentQueue() {
  const { data: jobs, loading } = useSubagentQueue();

  if (loading) return <LoadingState label="Loading queue..." />;

  const list = jobs ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">Subagent Queue</h2>
        <span className="text-xs text-muted-foreground ml-auto">{list.length} jobs</span>
      </div>
      {list.length === 0 ? (
        <EmptyState label="No queued jobs." />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="text-left px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Job</th>
                <th className="text-left px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Task</th>
                <th className="text-left px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="text-right px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">ETA</th>
              </tr>
            </thead>
            <tbody>
              {list.map((j) => (
                <tr key={j.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs text-foreground">{j.id}</td>
                  <td className="px-4 py-2.5 text-foreground">{j.task}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={j.status} /></td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">{j.eta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
