import { mockRuns, Run } from "@/data/mockRuns";
import { StatusBadge } from "./StatusBadge";
import { Clock, Hash, Cpu, Coins } from "lucide-react";

function formatDuration(ms: number | null) {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function RunsTable({ onSelectRun }: { onSelectRun: (run: Run) => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">Runs</h2>
        <span className="text-xs text-muted-foreground">{mockRuns.length} total</span>
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50">
              <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
              <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Run ID</th>
              <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground hidden md:table-cell">Started</th>
              <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground hidden md:table-cell">Duration</th>
              <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground hidden lg:table-cell">Agent / Lane</th>
              <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground hidden lg:table-cell">User</th>
              <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground hidden xl:table-cell">Tokens</th>
              <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground hidden xl:table-cell">Cost</th>
            </tr>
          </thead>
          <tbody>
            {mockRuns.map((run) => (
              <tr
                key={run.id}
                onClick={() => onSelectRun(run)}
                className="border-b border-border last:border-0 hover:bg-secondary/30 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3"><StatusBadge status={run.status} /></td>
                <td className="px-4 py-3 font-mono text-xs text-foreground">{run.id}</td>
                <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{formatTime(run.startedAt)}</td>
                <td className="px-4 py-3 font-mono text-xs hidden md:table-cell">{formatDuration(run.durationMs)}</td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  <span className="text-foreground">{run.agent}</span>
                  <span className="text-muted-foreground"> / {run.lane}</span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground hidden lg:table-cell">{run.userId}</td>
                <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground hidden xl:table-cell">{run.tokensUsed.toLocaleString()}</td>
                <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground hidden xl:table-cell">${run.cost.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
