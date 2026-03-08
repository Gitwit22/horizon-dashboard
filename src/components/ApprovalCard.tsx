import { useState } from "react";
import type { ApprovalRequest } from "@/types/chat";
import { ShieldCheck, ShieldX, Loader2 } from "lucide-react";

interface Props {
  approval: ApprovalRequest;
  onRespond: (approvalId: string, decision: "approve" | "deny") => Promise<void>;
}

export function ApprovalCard({ approval, onRespond }: Props) {
  const [busy, setBusy] = useState(false);

  const handle = async (decision: "approve" | "deny") => {
    setBusy(true);
    try {
      await onRespond(approval.approvalId, decision);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-warning/40 bg-warning/5 p-4 space-y-3 max-w-md">
      {/* Header */}
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-warning" />
        <span className="text-sm font-semibold text-warning uppercase tracking-wider">
          Approval Required
        </span>
      </div>

      {/* Summary */}
      <p className="text-sm text-foreground">{approval.summary}</p>

      {/* Diff / Receipt preview */}
      {(approval.diff || approval.receipt) && (
        <pre className="text-xs font-mono bg-background rounded p-2 max-h-48 overflow-auto whitespace-pre-wrap text-muted-foreground border border-border">
          {approval.diff || approval.receipt}
        </pre>
      )}

      {/* Action buttons */}
      {!approval.resolved ? (
        <div className="flex gap-2">
          <button
            disabled={busy}
            onClick={() => handle("approve")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded bg-success/20 text-success border border-success/30 hover:bg-success/30 transition-colors disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            Approve
          </button>
          <button
            disabled={busy}
            onClick={() => handle("deny")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded bg-destructive/20 text-destructive border border-destructive/30 hover:bg-destructive/30 transition-colors disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldX className="h-3.5 w-3.5" />}
            Deny
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">
          {approval.decision === "approve" ? "Approved" : "Denied"}
        </p>
      )}
    </div>
  );
}
