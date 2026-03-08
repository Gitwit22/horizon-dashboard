import { useChat } from "@/context/ChatContext";
import { useHeartbeat } from "@/hooks/useHorizonData";
import { RefreshCw, Wifi, WifiOff, Loader2, Activity } from "lucide-react";
import { useState } from "react";
import { getAuthHeaders, getGatewayUrl } from "@/api/auth";
import { getDefaultOpsHostKey, runRemoteOpsAction, type OpsAction } from "@/api/opsApi";
import { toast } from "@/hooks/use-toast";

const GATEWAY_URL = getGatewayUrl();

export function ConnectionControl() {
  const { connectionStatus, reconnect } = useChat();
  const { data: heartbeat, loading: heartbeatLoading, error: heartbeatError } = useHeartbeat();
  const [testing, setTesting] = useState(false);
  const [opsBusyAction, setOpsBusyAction] = useState<OpsAction | null>(null);
  const [gatewayOk, setGatewayOk] = useState<boolean | null>(null);
  const defaultHostKey = getDefaultOpsHostKey();

  const runRemoteAction = async (action: OpsAction) => {
    if (!defaultHostKey) {
      toast({ title: "Remote host not configured", description: "Set VITE_DEFAULT_OPS_HOSTKEY to enable remote ops." });
      return;
    }

    const approved = action === "start-horizon" || action === "restart-horizon"
      ? window.confirm(`Approve high-risk action: ${action}?`)
      : true;
    if (!approved) return;

    setOpsBusyAction(action);
    try {
      const result = await runRemoteOpsAction(defaultHostKey, action, true);
      toast({ title: `Remote action sent: ${action}`, description: `requestId ${result.requestId}` });
    } catch (error) {
      toast({ title: `Remote action failed: ${action}`, description: error instanceof Error ? error.message : "Unknown error" });
    } finally {
      setOpsBusyAction(null);
    }
  };

  const testGateway = async () => {
    setTesting(true);
    setGatewayOk(null);
    try {
      const res = await fetch(`${GATEWAY_URL}/api/heartbeat`, {
        headers: getAuthHeaders(),
        signal: AbortSignal.timeout(8000),
      });
      setGatewayOk(res.ok);
    } catch {
      setGatewayOk(false);
    } finally {
      setTesting(false);
    }
  };

  const handleReconnectAll = async () => {
    await testGateway();
    reconnect();
  };

  // SSE status
  const sseConnected = connectionStatus === "connected";
  const sseReconnecting = connectionStatus === "reconnecting";
  const sseColor = sseConnected
    ? "text-green-400"
    : sseReconnecting
      ? "text-yellow-400"
      : "text-red-400";
  const sseLabel = sseConnected
    ? "Connected"
    : sseReconnecting
      ? "Reconnecting…"
      : "Disconnected";

  // Gateway status
  const gatewayAlive = !heartbeatError && !!heartbeat;

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-white flex items-center gap-2">
          <Activity className="h-4 w-4 text-orange-400" />
          Connection Status
        </h3>
        <button
          onClick={handleReconnectAll}
          disabled={testing}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
        >
          {testing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Reconnect
        </button>
      </div>

      {/* Status rows */}
      <div className="grid gap-3 sm:grid-cols-3">
        {/* Gateway API */}
        <div className="rounded-md border border-slate-700 bg-slate-800 p-3 space-y-1">
          <p className="text-xs text-slate-400 uppercase tracking-wide">Gateway API</p>
          <div className="flex items-center gap-2">
            {heartbeatLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            ) : gatewayAlive ? (
              <Wifi className="h-4 w-4 text-green-400" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-400" />
            )}
            <span className={`text-sm font-medium ${gatewayAlive ? "text-green-400" : heartbeatLoading ? "text-slate-400" : "text-red-400"}`}>
              {heartbeatLoading ? "Checking…" : gatewayAlive ? "Online" : "Unreachable"}
            </span>
          </div>
          {heartbeat && (
            <p className="text-xs text-slate-500">
              Last event: {new Date(heartbeat.lastEventReceived).toLocaleTimeString()}
            </p>
          )}
        </div>

        {/* SSE Stream */}
        <div className="rounded-md border border-slate-700 bg-slate-800 p-3 space-y-1">
          <p className="text-xs text-slate-400 uppercase tracking-wide">Chat Stream (SSE)</p>
          <div className="flex items-center gap-2">
            {sseConnected ? (
              <Wifi className="h-4 w-4 text-green-400" />
            ) : sseReconnecting ? (
              <Loader2 className="h-4 w-4 animate-spin text-yellow-400" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-400" />
            )}
            <span className={`text-sm font-medium ${sseColor}`}>{sseLabel}</span>
          </div>
        </div>

        {/* Quick test */}
        <div className="rounded-md border border-slate-700 bg-slate-800 p-3 space-y-1">
          <p className="text-xs text-slate-400 uppercase tracking-wide">Manual Test</p>
          <button
            onClick={testGateway}
            disabled={testing}
            className="flex items-center gap-2 text-sm text-slate-300 hover:text-white disabled:opacity-50"
          >
            {testing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {testing ? "Testing…" : "Ping Gateway"}
          </button>
          {gatewayOk !== null && !testing && (
            <p className={`text-xs font-medium ${gatewayOk ? "text-green-400" : "text-red-400"}`}>
              {gatewayOk ? "✓ Gateway responded OK" : "✗ Gateway unreachable"}
            </p>
          )}
        </div>
      </div>

      <div className="rounded-md border border-slate-700 bg-slate-800 p-3 space-y-2">
        <p className="text-xs text-slate-400 uppercase tracking-wide">Remote Ops</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => runRemoteAction("start-horizon")}
            disabled={!defaultHostKey || !!opsBusyAction}
            className="px-3 py-1.5 text-xs rounded bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {opsBusyAction === "start-horizon" ? "Starting…" : "Start Horizon (Remote)"}
          </button>
          <button
            onClick={() => runRemoteAction("restart-horizon")}
            disabled={!defaultHostKey || !!opsBusyAction}
            className="px-3 py-1.5 text-xs rounded bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {opsBusyAction === "restart-horizon" ? "Restarting…" : "Restart Horizon (Remote)"}
          </button>
          <button
            onClick={() => runRemoteAction("reconnect-gateway")}
            disabled={!defaultHostKey || !!opsBusyAction}
            className="px-3 py-1.5 text-xs rounded bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {opsBusyAction === "reconnect-gateway" ? "Reconnecting…" : "Reconnect Gateway (Remote)"}
          </button>
        </div>
        {!defaultHostKey && (
          <p className="text-xs text-yellow-400">Set VITE_DEFAULT_OPS_HOSTKEY to enable remote operations.</p>
        )}
      </div>
    </div>
  );
}
