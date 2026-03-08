import { Bell, AlertTriangle } from "lucide-react";
import { useAlerts } from "@/hooks/useHorizonData";
import { LoadingState, EmptyState, ErrorState } from "@/components/DataStates";

export function AlertCustomization() {
  const { data: alerts, loading, error, refresh } = useAlerts();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">Alerts</h2>
      </div>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={refresh} />}
      {!loading && !error && (!alerts || alerts.length === 0) && (
        <EmptyState message="No alert rules configured." />
      )}

      {alerts && alerts.length > 0 && (
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
      )}
    </div>
  );
}
