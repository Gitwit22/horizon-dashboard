import { Brain, RefreshCw, Clock } from "lucide-react";

const memoryItems = [
  { label: "MEMORY.md update", value: "4h ago", icon: Brain, fresh: false },
  { label: "Daily notes", value: "Fresh", icon: RefreshCw, fresh: true },
  { label: "Next scheduled refresh", value: "6h", icon: Clock, fresh: true },
];

export function MemoryStatus() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Brain className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">Memory Status</h2>
      </div>
      <div className="space-y-2">
        {memoryItems.map((m) => (
          <div key={m.label} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
            <m.icon className={`h-4 w-4 shrink-0 ${m.fresh ? "text-success" : "text-warning"}`} />
            <span className="text-sm text-foreground flex-1">{m.label}</span>
            <span className={`text-xs font-mono ${m.fresh ? "text-success" : "text-warning"}`}>{m.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
