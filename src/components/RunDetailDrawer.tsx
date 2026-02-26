import { Run, RunStep, StepType } from "@/data/mockRuns";
import { StatusBadge } from "./StatusBadge";
import { X, ChevronDown, ChevronRight, Brain, Wrench, Sparkles, AlertTriangle } from "lucide-react";
import { useState } from "react";

const stepIcons: Record<StepType, any> = {
  llm_call: Brain,
  tool_call: Wrench,
  skill_call: Sparkles,
};

const stepColors: Record<StepType, string> = {
  llm_call: "text-primary",
  tool_call: "text-success",
  skill_call: "text-warning",
};

function StepItem({ step, index }: { step: RunStep; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = stepIcons[step.type];

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors text-left"
      >
        <span className="text-xs text-muted-foreground font-mono w-5">{index + 1}</span>
        <div className="relative">
          <Icon className={`h-4 w-4 ${stepColors[step.type]}`} />
        </div>
        <div className="flex-1 min-w-0">
          <span className="font-medium text-sm text-foreground">{step.name}</span>
          <span className="text-xs text-muted-foreground ml-2 uppercase">{step.type.replace("_", " ")}</span>
        </div>
        {step.error && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
        {step.durationMs !== null && (
          <span className="text-xs font-mono text-muted-foreground">{step.durationMs}ms</span>
        )}
        {step.tokensUsed && (
          <span className="text-xs font-mono text-muted-foreground">{step.tokensUsed} tok</span>
        )}
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {expanded && (
        <div className="border-t border-border bg-secondary/20 px-4 py-3 space-y-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Input</p>
            <pre className="text-xs font-mono text-foreground bg-background rounded p-2 overflow-x-auto">{step.input}</pre>
          </div>
          {step.output && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Output</p>
              <pre className="text-xs font-mono text-foreground bg-background rounded p-2 overflow-x-auto">{step.output}</pre>
            </div>
          )}
          {step.error && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-destructive mb-1">Error</p>
              <pre className="text-xs font-mono text-destructive bg-destructive/5 rounded p-2 overflow-x-auto">{step.error}</pre>
              {step.retryCount > 0 && (
                <p className="text-xs text-muted-foreground mt-1">Retried {step.retryCount} time{step.retryCount > 1 ? 's' : ''}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function RunDetailDrawer({ run, onClose }: { run: Run; onClose: () => void }) {
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-card border-l border-border shadow-2xl z-50 animate-slide-in flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <h2 className="font-mono text-sm font-bold text-foreground">{run.id}</h2>
          <StatusBadge status={run.status} />
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-secondary transition-colors">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {/* Meta */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Channel</p>
            <p className="font-medium text-foreground">{run.channel}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">User ID</p>
            <p className="font-mono text-foreground">{run.userId}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Agent / Lane</p>
            <p className="text-foreground">{run.agent} <span className="text-muted-foreground">/ {run.lane}</span></p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Duration</p>
            <p className="font-mono text-foreground">{run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : "In progress..."}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Tokens</p>
            <p className="font-mono text-foreground">{run.tokensUsed.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Cost</p>
            <p className="font-mono text-primary">${run.cost.toFixed(4)}</p>
          </div>
        </div>

        {/* Error */}
        {run.error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <p className="text-sm font-medium text-destructive">Error</p>
            </div>
            <pre className="text-xs font-mono text-destructive/90 whitespace-pre-wrap">{run.error}</pre>
          </div>
        )}

        {/* Steps */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Step Timeline ({run.steps.length} steps)
          </h3>
          <div className="space-y-2">
            {run.steps.map((step, i) => (
              <StepItem key={step.id} step={step} index={i} />
            ))}
            {run.steps.length === 0 && (
              <p className="text-sm text-muted-foreground italic">No steps executed yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
