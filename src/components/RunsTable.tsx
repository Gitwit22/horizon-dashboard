import { useState, useMemo } from "react";
import { useRuns } from "@/hooks/useHorizonData";
import type { Run, RunStatus } from "@/types/horizon";
import { StatusBadge } from "./StatusBadge";
import { LoadingState, EmptyState, ErrorState } from "@/components/DataStates";
import { Search, RefreshCw, Filter, Activity, AlertCircle, CheckCircle2, Clock, Loader2 } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function formatDuration(ms: number | null) {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Handles ISO strings AND pre-formatted times like "04:16 PM" */
function formatTime(raw: string) {
  if (!raw) return "—";
  // If it already looks like a display time (e.g. "04:16 PM"), return as-is
  if (/^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(raw)) return raw;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw; // unparseable – show verbatim
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function shortId(id: string) {
  if (id.length <= 16) return id;
  return id.slice(0, 8) + "…" + id.slice(-6);
}

const STATUS_OPTIONS: { value: RunStatus | "all"; label: string; icon: any }[] = [
  { value: "all",     label: "All",     icon: Filter },
  { value: "running", label: "Running", icon: Loader2 },
  { value: "success", label: "Success", icon: CheckCircle2 },
  { value: "error",   label: "Error",   icon: AlertCircle },
  { value: "queued",  label: "Queued",  icon: Clock },
];

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function RunsTable({ onSelectRun }: { onSelectRun: (run: Run) => void }) {
  const { data: runs, loading, error, refresh } = useRuns();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<RunStatus | "all">("all");

  // Derived: filter + search
  const filtered = useMemo(() => {
    if (!runs) return [];
    return runs.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          r.id.toLowerCase().includes(q) ||
          r.agent.toLowerCase().includes(q) ||
          r.userId.toLowerCase().includes(q) ||
          r.status.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [runs, search, statusFilter]);

  // Stats
  const stats = useMemo(() => {
    if (!runs) return { total: 0, running: 0, success: 0, error: 0, queued: 0 };
    return {
      total: runs.length,
      running: runs.filter((r) => r.status === "running").length,
      success: runs.filter((r) => r.status === "success").length,
      error: runs.filter((r) => r.status === "error").length,
      queued: runs.filter((r) => r.status === "queued").length,
    };
  }, [runs]);

  if (loading) return <LoadingState label="Loading runs..." />;
  if (error) return <ErrorState label={error} />;
  if (!runs || runs.length === 0) return <EmptyState label="No runs recorded yet." />;

  return (
    <div className="space-y-4">
      {/* ---- Stats row ---- */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label="Total" value={stats.total} icon={<Activity className="h-4 w-4 text-primary" />} />
        <StatCard label="Running" value={stats.running} icon={<Loader2 className="h-4 w-4 text-primary animate-spin" />} />
        <StatCard label="Success" value={stats.success} icon={<CheckCircle2 className="h-4 w-4 text-success" />} />
        <StatCard label="Errors" value={stats.error} icon={<AlertCircle className="h-4 w-4 text-destructive" />} />
        <StatCard label="Queued" value={stats.queued} icon={<Clock className="h-4 w-4 text-muted-foreground" />} />
      </div>

      {/* ---- Toolbar ---- */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by ID, agent, user…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/30 p-1">
          {STATUS_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = statusFilter === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {opt.label}
              </button>
            );
          })}
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-border hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* ---- Table ---- */}
      {filtered.length === 0 ? (
        <EmptyState label={`No runs match "${search || statusFilter}".`} />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Run ID</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground hidden md:table-cell">Started</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground hidden md:table-cell">Duration</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground hidden lg:table-cell">Agent</th>
                <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground hidden xl:table-cell">Tokens</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((run) => (
                <tr
                  key={run.id}
                  onClick={() => onSelectRun(run)}
                  className="border-b border-border last:border-0 hover:bg-secondary/30 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3"><StatusBadge status={run.status} /></td>
                  <td className="px-4 py-3 font-mono text-xs text-foreground" title={run.id}>{shortId(run.id)}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{formatTime(run.startedAt)}</td>
                  <td className="px-4 py-3 font-mono text-xs hidden md:table-cell">{formatDuration(run.durationMs)}</td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="text-foreground">{run.agent}</span>
                    {run.lane && run.lane !== "general" && <span className="text-muted-foreground"> / {run.lane}</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground hidden xl:table-cell">{run.tokensUsed > 0 ? run.tokensUsed.toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground text-right">
        Showing {filtered.length} of {stats.total} runs • polling every 10 s
      </p>
    </div>
  );
}

/* ---- Tiny stat card ---- */
function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 flex items-center gap-3">
      {icon}
      <div>
        <p className="text-lg font-bold text-foreground leading-none">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}
