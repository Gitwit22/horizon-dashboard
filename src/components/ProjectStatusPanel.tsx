import { CheckCircle, AlertTriangle, Clock, Lock } from "lucide-react";
import { useProjectStatus } from "@/hooks/useHorizonData";
import { LoadingState, EmptyState } from "@/components/DataStates";

const statusIcons = {
  ok: <CheckCircle className="h-3.5 w-3.5 text-success" />,
  warning: <AlertTriangle className="h-3.5 w-3.5 text-warning" />,
  blocked: <Lock className="h-3.5 w-3.5 text-destructive" />,
  pending: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
};

const statusBg = {
  ok: "border-success/20",
  warning: "border-warning/20",
  blocked: "border-destructive/20",
  pending: "border-border",
};

export function ProjectStatusPanel() {
  const { data: projects, loading } = useProjectStatus();

  if (loading) return <LoadingState label="Loading projects..." />;
  if (!projects || projects.length === 0) return <EmptyState label="No project data available." />;

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">Project Status</h2>
      <div className="grid gap-3 md:grid-cols-3">
        {projects.map((p) => (
          <div key={p.name} className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h3 className="font-bold text-foreground text-sm">{p.name}</h3>
            {p.tasks.map((t) => (
              <div key={t.label} className={`flex items-start gap-2 rounded-md border p-2 ${statusBg[t.status] ?? statusBg.pending}`}>
                {statusIcons[t.status] ?? statusIcons.pending}
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">{t.label}</p>
                  <p className="text-xs text-muted-foreground">{t.value}</p>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
