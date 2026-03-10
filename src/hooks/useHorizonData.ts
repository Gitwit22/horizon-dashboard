import { useState, useEffect, useCallback, useRef } from "react";
import { getAuthHeaders, getGatewayUrl } from "@/api/auth";
import {
  fetchHeartbeat as apiFetchHeartbeat,
  fetchRuns as apiFetchRuns,
  fetchProjectStatus as apiFetchProjectStatus,
  fetchSkillStats as apiFetchSkillStats,
  fetchCostBreakdown as apiFetchCostBreakdown,
  fetchAlerts as apiFetchAlerts,
} from "@/api/horizonApi";
import type {
  HeartbeatData,
  Run,
  RunStep,
  RunStatus,
  ProjectItem,
  ProjectTask,
  SkillStat,
  CostProject,
  SubagentJob,
  MemoryItem,
  AlertRule,
} from "@/types/horizon";

const GATEWAY_URL = getGatewayUrl();

// ---------------------------------------------------------------------------
// Generic polling hook
// ---------------------------------------------------------------------------
interface UsePollingResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs: number,
): UsePollingResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const result = await fetcher();
      if (mountedRef.current) {
        setData(result);
        setError(null);
        setLoading(false);
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "Fetch failed");
        setLoading(false);
      }
    }
  }, [fetcher]);

  useEffect(() => {
    mountedRef.current = true;
    load();

    let id: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (!id) id = setInterval(load, intervalMs);
    };
    const stop = () => {
      if (id) { clearInterval(id); id = null; }
    };

    // Pause polling when tab is hidden to save bandwidth/CPU
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        load(); // Refresh immediately when tab becomes visible
        start();
      }
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      mountedRef.current = false;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load, intervalMs]);

  return { data, loading, error, refresh: load };
}

// ---------------------------------------------------------------------------
// Normalizers – map whatever the API returns to canonical types
// ---------------------------------------------------------------------------
function normalizeStatus(raw: string): RunStatus {
  const lower = raw?.toLowerCase?.() ?? "queued";
  if (lower === "success" || lower === "completed") return "success";
  if (lower === "error" || lower === "failed") return "error";
  if (lower === "running" || lower === "in_progress") return "running";
  return "queued";
}

function parseDuration(dur: string): number | null {
  if (!dur) return null;
  const match = dur.match(/([\d.]+)\s*(ms|s|m)/);
  if (!match) return null;
  const val = parseFloat(match[1]);
  if (match[2] === "ms") return val;
  if (match[2] === "s") return val * 1000;
  if (match[2] === "m") return val * 60000;
  return null;
}

function normalizeRun(raw: Record<string, unknown>): Run {
  const rawSteps = raw.steps;
  const rawDuration = raw.duration;
  return {
    id: (raw.id as string) ?? (raw.runId as string) ?? "",
    status: normalizeStatus(raw.status as string),
    startedAt: (raw.startedAt as string) ?? (raw.started as string) ?? new Date().toISOString(),
    finishedAt: (raw.finishedAt as string) ?? (raw.finished as string) ?? null,
    durationMs:
      (raw.durationMs as number) ?? (typeof rawDuration === "string" ? parseDuration(rawDuration) : (rawDuration as number) ?? null),
    channel: (raw.channel as string) ?? "api",
    userId: (raw.userId as string) ?? (raw.user as string) ?? "",
    agent: (raw.agent as string) ?? "horizon-main",
    lane: (raw.lane as string) ?? "general",
    stepsCount: (raw.stepsCount as number) ?? (Array.isArray(rawSteps) ? rawSteps.length : 0),
    tokensUsed: (raw.tokensUsed as number) ?? (raw.tokens as number) ?? 0,
    cost: (raw.cost as number) ?? 0,
    error: (raw.error as string) ?? null,
    steps: Array.isArray(rawSteps) ? (rawSteps as RunStep[]) : [],
  };
}

function normalizeHeartbeat(raw: Record<string, unknown>): HeartbeatData {
  return {
    lastEventReceived:
      (raw.lastEventReceived as string) ??
      (raw.lastEvent instanceof Date ? raw.lastEvent.toISOString() : (raw.lastEvent as string)) ??
      new Date().toISOString(),
    lastSuccessfulRun:
      (raw.lastSuccessfulRun as string) ??
      (raw.lastSuccess instanceof Date ? raw.lastSuccess.toISOString() : (raw.lastSuccess as string)) ??
      new Date().toISOString(),
    currentQueueSize: (raw.currentQueueSize as number) ?? (raw.queueSize as number) ?? 0,
    activeRuns: (raw.activeRuns as number) ?? 0,
    stuckThresholdSeconds: (raw.stuckThresholdSeconds as number) ?? (raw.stuckThreshold as number) ?? 120,
    avgResponseTimeMs:
      (raw.avgResponseTimeMs as number) ?? (raw.avgResponse != null ? (raw.avgResponse as number) * 1000 : 0),
    totalRunsToday: (raw.totalRunsToday as number) ?? (raw.runsToday as number) ?? 0,
    errorRatePercent:
      (raw.errorRatePercent as number) ?? (raw.errorRate != null ? (raw.errorRate as number) * 100 : 0),
  };
}

function normalizeProjects(raw: Record<string, unknown>[]): ProjectItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((p) => ({
    name: (p.name as string) ?? "Unknown",
    tasks: Array.isArray(p.tasks)
      ? (p.tasks as ProjectTask[])
      : Array.isArray(p.metrics)
        ? (p.metrics as Record<string, unknown>[]).map((m) => ({
            label: (m.label as string) ?? "",
            value: (m.value as string) ?? "",
            status: (m.status as ProjectTask["status"]) ?? ((p.status as string) === "warning" ? "warning" : "ok"),
          }))
        : [],
  }));
}

function normalizeSkills(raw: Record<string, unknown>[]): SkillStat[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => ({
    name: (s.name as string) ?? "",
    runs: (s.runs as number) ?? (s.completed as number) ?? 0,
    status: (s.status as SkillStat["status"]) ?? "active",
  }));
}

function normalizeCosts(raw: Record<string, unknown>[]): CostProject[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c) => ({
    name: (c.name as string) ?? (c.project as string) ?? "Unknown",
    total: (c.total as number) ?? (c.cost as number) ?? 0,
    breakdown: Array.isArray(c.breakdown)
      ? (c.breakdown as Record<string, unknown>[]).map((b) => ({
          provider: (b.provider as string) ?? (b.label as string) ?? "",
          cost: (b.cost as number) ?? (b.amount as number) ?? 0,
          label: b.label as string | undefined,
        }))
      : [],
  }));
}

// ---------------------------------------------------------------------------
// Exported hooks
// ---------------------------------------------------------------------------

export function useHeartbeat(pollMs = 5_000) {
  const fetcher = useCallback(async () => {
    const raw = await apiFetchHeartbeat();
    return normalizeHeartbeat(raw);
  }, []);
  return usePolling<HeartbeatData>(fetcher, pollMs);
}

export function useRuns(pollMs = 10_000) {
  const fetcher = useCallback(async () => {
    const raw = await apiFetchRuns();
    return raw.map(normalizeRun);
  }, []);
  return usePolling<Run[]>(fetcher, pollMs);
}

export function useProjectStatus(pollMs = 30_000) {
  const fetcher = useCallback(async () => {
    const raw = await apiFetchProjectStatus();
    return normalizeProjects(raw);
  }, []);
  return usePolling<ProjectItem[]>(fetcher, pollMs);
}

export function useSkillStats(pollMs = 30_000) {
  const fetcher = useCallback(async () => {
    const raw = await apiFetchSkillStats();
    return normalizeSkills(raw);
  }, []);
  return usePolling<SkillStat[]>(fetcher, pollMs);
}

export function useCostBreakdown(pollMs = 60_000) {
  const fetcher = useCallback(async () => {
    const raw = await apiFetchCostBreakdown();
    return normalizeCosts(raw);
  }, []);
  return usePolling<CostProject[]>(fetcher, pollMs);
}

export function useAlerts(pollMs = 30_000) {
  const fetcher = useCallback(async () => {
    const raw = await apiFetchAlerts();
    if (!Array.isArray(raw)) return [];
    return raw.map((a: Record<string, unknown>): AlertRule => ({
      id: (a.id as AlertRule["id"]) ?? "",
      label: (a.label as string) ?? (a.name as string) ?? "",
      threshold: (a.threshold as string) ?? "",
      active: (a.active as boolean) ?? true,
      triggered: (a.triggered as boolean) ?? false,
    }));
  }, []);
  return usePolling<AlertRule[]>(fetcher, pollMs);
}

export function useSubagentQueue(pollMs = 10_000) {
  const fetcher = useCallback(async (): Promise<SubagentJob[]> => {
    try {
      const res = await fetch(`${GATEWAY_URL}/api/queue`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return [];
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.jobs ?? [];
      return list.map((j: Record<string, unknown>) => ({
        id: (j.id as string) ?? "",
        task: (j.task as string) ?? (j.name as string) ?? "",
        status: normalizeStatus(j.status as string),
        eta: (j.eta as string) ?? "—",
      }));
    } catch {
      return [];
    }
  }, []);
  return usePolling<SubagentJob[]>(fetcher, pollMs);
}

export function useMemoryStatus(pollMs = 30_000) {
  const fetcher = useCallback(async (): Promise<MemoryItem[]> => {
    try {
      const res = await fetch(`${GATEWAY_URL}/api/memory`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return [];
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.items ?? [];
      return list.map((m: Record<string, unknown>) => ({
        label: (m.label as string) ?? (m.name as string) ?? "",
        value: (m.value as string) ?? "",
        fresh: (m.fresh as boolean) ?? m.status === "fresh",
      }));
    } catch {
      return [];
    }
  }, []);
  return usePolling<MemoryItem[]>(fetcher, pollMs);
}
