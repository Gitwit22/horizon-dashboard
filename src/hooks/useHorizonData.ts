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
  RunStatus,
  ProjectItem,
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
    } catch (err: any) {
      if (mountedRef.current) {
        setError(err?.message ?? "Fetch failed");
        setLoading(false);
      }
    }
  }, [fetcher]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    const id = setInterval(load, intervalMs);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
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

function normalizeRun(raw: any): Run {
  return {
    id: raw.id ?? raw.runId ?? "",
    status: normalizeStatus(raw.status),
    startedAt: raw.startedAt ?? raw.started ?? new Date().toISOString(),
    finishedAt: raw.finishedAt ?? raw.finished ?? null,
    durationMs:
      raw.durationMs ?? (typeof raw.duration === "string" ? parseDuration(raw.duration) : raw.duration ?? null),
    channel: raw.channel ?? "api",
    userId: raw.userId ?? raw.user ?? "",
    agent: raw.agent ?? "horizon-main",
    lane: raw.lane ?? "general",
    stepsCount: raw.stepsCount ?? raw.steps?.length ?? 0,
    tokensUsed: raw.tokensUsed ?? raw.tokens ?? 0,
    cost: raw.cost ?? 0,
    error: raw.error ?? null,
    steps: Array.isArray(raw.steps) ? raw.steps : [],
  };
}

function normalizeHeartbeat(raw: any): HeartbeatData {
  return {
    lastEventReceived:
      raw.lastEventReceived ??
      (raw.lastEvent instanceof Date ? raw.lastEvent.toISOString() : raw.lastEvent) ??
      new Date().toISOString(),
    lastSuccessfulRun:
      raw.lastSuccessfulRun ??
      (raw.lastSuccess instanceof Date ? raw.lastSuccess.toISOString() : raw.lastSuccess) ??
      new Date().toISOString(),
    currentQueueSize: raw.currentQueueSize ?? raw.queueSize ?? 0,
    activeRuns: raw.activeRuns ?? 0,
    stuckThresholdSeconds: raw.stuckThresholdSeconds ?? raw.stuckThreshold ?? 120,
    avgResponseTimeMs:
      raw.avgResponseTimeMs ?? (raw.avgResponse != null ? raw.avgResponse * 1000 : 0),
    totalRunsToday: raw.totalRunsToday ?? raw.runsToday ?? 0,
    errorRatePercent:
      raw.errorRatePercent ?? (raw.errorRate != null ? raw.errorRate * 100 : 0),
  };
}

function normalizeProjects(raw: any[]): ProjectItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((p) => ({
    name: p.name ?? "Unknown",
    tasks: Array.isArray(p.tasks)
      ? p.tasks
      : Array.isArray(p.metrics)
        ? p.metrics.map((m: any) => ({
            label: m.label ?? "",
            value: m.value ?? "",
            status: m.status ?? (p.status === "warning" ? "warning" : "ok"),
          }))
        : [],
  }));
}

function normalizeSkills(raw: any[]): SkillStat[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => ({
    name: s.name ?? "",
    runs: s.runs ?? s.completed ?? 0,
    status: s.status ?? "active",
  }));
}

function normalizeCosts(raw: any[]): CostProject[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c) => ({
    name: c.name ?? c.project ?? "Unknown",
    total: c.total ?? c.cost ?? 0,
    breakdown: Array.isArray(c.breakdown)
      ? c.breakdown.map((b: any) => ({
          provider: b.provider ?? b.label ?? "",
          cost: b.cost ?? b.amount ?? 0,
          label: b.label,
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
    return raw.map((a: any): AlertRule => ({
      id: a.id ?? "",
      label: a.label ?? a.name ?? "",
      threshold: a.threshold ?? "",
      active: a.active ?? true,
      triggered: a.triggered ?? false,
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
      return list.map((j: any) => ({
        id: j.id ?? "",
        task: j.task ?? j.name ?? "",
        status: normalizeStatus(j.status),
        eta: j.eta ?? "—",
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
      return list.map((m: any) => ({
        label: m.label ?? m.name ?? "",
        value: m.value ?? "",
        fresh: m.fresh ?? m.status === "fresh",
      }));
    } catch {
      return [];
    }
  }, []);
  return usePolling<MemoryItem[]>(fetcher, pollMs);
}
