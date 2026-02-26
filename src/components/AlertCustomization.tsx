import { Bell, AlertTriangle } from "lucide-react";

const alerts = [
  { id: 1, label: "Error rate > 5%", threshold: "5%", active: true, triggered: false },
  { id: 2, label: "Run stuck > 2m", threshold: "120s", active: true, triggered: false },
  { id: 3, label: "Anthropic spend > $10/day", threshold: "$10", active: true, triggered: false },
  { id: 4, label: "Capital sprint: 0 responses by Day 5", threshold: "Day 5", active: true, triggered: true },
];

export function AlertCustomization() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">Alerts</h2>
      </div>
      <div className="space-y-2">
        {alerts.map((a) => (
          <div
            key={a.id}
            className={`flex items-center gap-3 rounded-lg border p-3 ${
              a.triggered ? "border-destructive/30 bg-destructive/5" : "border-border bg-card"
            }`}
          >
            {a.triggered && <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className={`text-sm ${a.triggered ? "text-destructive font-medium" : "text-foreground"}`}>{a.label}</p>
            </div>
            <span className="text-xs font-mono text-muted-foreground">{a.threshold}</span>
            <div className={`h-2 w-7 rounded-full ${a.active ? "bg-primary" : "bg-secondary"}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
