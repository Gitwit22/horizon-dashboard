import type { Run, RunStep, StepType } from "@/types/horizon";
import { StatusBadge } from "./StatusBadge";
import { X, ChevronDown, ChevronRight, Brain, Wrench, Sparkles, AlertTriangle, Copy, Check } from "lucide-react";
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

/** Handles ISO strings AND pre-formatted times like "04:16 PM" */
function formatTime(raw: string) {
  if (!raw) return "—";
  if (/^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(raw)) return raw;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDuration(ms: number | null) {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button onClick={handleCopy} className="p-1 rounded hover:bg-secondary/50 transition-colors" title="Copy run ID">
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
    </button>
  );
}

export function RunDetailDrawer({ run, onClose }: { run: Run; onClose: () => void }) {
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-xl bg-card border-l border-border shadow-2xl z-50 animate-slide-in flex flex-col">
      {/* ---- Header ---- */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <StatusBadge status={run.status} />
          <div className="flex items-center gap-1.5">
            <h2 className="font-mono text-sm font-bold text-foreground truncate max-w-[260px]" title={run.id}>{run.id}</h2>
            <CopyButton text={run.id} />
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-secondary transition-colors">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {/* ---- Meta grid ---- */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <MetaField label="Started" value={formatTime(run.startedAt)} mono />
          <MetaField label="Duration" value={formatDuration(run.durationMs)} mono />
          <MetaField label="Agent" value={run.agent} />
          {run.lane && run.lane !== "general" && <MetaField label="Lane" value={run.lane} />}
          {run.channel && run.channel !== "api" && <MetaField label="Channel" value={run.channel} />}
          {run.userId && <MetaField label="User" value={run.userId} mono />}
          <MetaField label="Tokens" value={run.tokensUsed > 0 ? run.tokensUsed.toLocaleString() : "—"} mono />
          <MetaField label="Cost" value={run.cost > 0 ? `$${run.cost.toFixed(4)}` : "—"} highlight={run.cost > 0} mono />
        </div>

        {/* ---- Error ---- */}
        {run.error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <p className="text-sm font-medium text-destructive">Error</p>
            </div>
            <pre className="text-xs font-mono text-destructive/90 whitespace-pre-wrap">{run.error}</pre>
          </div>
        )}

        {/* ---- Steps ---- */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Step Timeline {run.steps.length > 0 && `(${run.steps.length} steps)`}
          </h3>
          {run.steps.length > 0 ? (
            <div className="space-y-2">
              {run.steps.map((step, i) => (
                <StepItem key={step.id} step={step} index={i} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-secondary/20 px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">Step-level detail is not available for this run.</p>
              <p className="text-xs text-muted-foreground mt-1">The gateway does not expose a per-run steps endpoint yet.</p>
            </div>
          )}
        </div>

        {/* ---- Raw JSON ---- */}
        <details className="group">
          <summary className="text-xs font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors">
            Raw Data
          </summary>
          <pre className="mt-2 text-xs font-mono text-muted-foreground bg-background rounded-lg border border-border p-3 overflow-x-auto max-h-60">
{JSON.stringify(run, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}

/* ---- Helper for meta fields ---- */
function MetaField({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`${mono ? "font-mono" : "font-medium"} ${highlight ? "text-primary" : "text-foreground"}`}>{value}</p>
    </div>
  );
}
