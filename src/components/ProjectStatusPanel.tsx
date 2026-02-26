import { CheckCircle, AlertTriangle, Clock, Lock } from "lucide-react";

interface ProjectItem {
  name: string;
  tasks: { label: string; value: string; status: "ok" | "warning" | "blocked" | "pending" }[];
}

const projects: ProjectItem[] = [
  {
    name: "StreamLine",
    tasks: [
      { label: "Capital sprint", value: "5/25 sent", status: "ok" },
      { label: "EDU outreach", value: "0/5 sent, auth blocked", status: "blocked" },
    ],
  },
  {
    name: "MeJay",
    tasks: [
      { label: "Beat catalog upload", value: "12/20 processed", status: "ok" },
      { label: "Distributor API", value: "awaiting key", status: "pending" },
    ],
  },
  {
    name: "WAMS",
    tasks: [
      { label: "Inventory sync", value: "last sync 2h ago", status: "ok" },
      { label: "Order pipeline", value: "3 pending review", status: "warning" },
    ],
  },
];

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
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">Project Status</h2>
      <div className="grid gap-3 md:grid-cols-3">
        {projects.map((p) => (
          <div key={p.name} className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h3 className="font-bold text-foreground text-sm">{p.name}</h3>
            {p.tasks.map((t) => (
              <div key={t.label} className={`flex items-start gap-2 rounded-md border p-2 ${statusBg[t.status]}`}>
                {statusIcons[t.status]}
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
