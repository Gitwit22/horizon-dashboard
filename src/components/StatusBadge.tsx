import { RunStatus } from "@/data/mockRuns";

const statusConfig: Record<RunStatus, { label: string; className: string }> = {
  queued: {
    label: "Queued",
    className: "bg-muted text-muted-foreground",
  },
  running: {
    label: "Running",
    className: "bg-primary/15 text-primary border border-primary/30 animate-pulse-glow",
  },
  success: {
    label: "Success",
    className: "bg-success/15 text-success border border-success/30",
  },
  error: {
    label: "Error",
    className: "bg-destructive/15 text-destructive border border-destructive/30",
  },
};

export function StatusBadge({ status }: { status: RunStatus }) {
  const config = statusConfig[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className}`}>
      {status === "running" && (
        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-glow" />
      )}
      {config.label}
    </span>
  );
}
