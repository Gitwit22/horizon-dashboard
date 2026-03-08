// Canonical types for Horizon Console – single source of truth.

export type RunStatus = "queued" | "running" | "success" | "error";

export type StepType = "llm_call" | "tool_call" | "skill_call";

export interface RunStep {
  id: string;
  type: StepType;
  name: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  input: string;
  output: string | null;
  error: string | null;
  retryCount: number;
  tokensUsed?: number;
  cost?: number;
}

export interface Run {
  id: string;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  channel: string;
  userId: string;
  agent: string;
  lane: string;
  stepsCount: number;
  tokensUsed: number;
  cost: number;
  error: string | null;
  steps: RunStep[];
}

export interface HeartbeatData {
  lastEventReceived: string;
  lastSuccessfulRun: string;
  currentQueueSize: number;
  activeRuns: number;
  stuckThresholdSeconds: number;
  avgResponseTimeMs: number;
  totalRunsToday: number;
  errorRatePercent: number;
}

export interface ProjectTask {
  label: string;
  value: string;
  status: "ok" | "warning" | "blocked" | "pending";
}

export interface ProjectItem {
  name: string;
  tasks: ProjectTask[];
}

export interface SkillStat {
  name: string;
  runs: number;
  status: "active" | "pending" | "error";
}

export interface CostProject {
  name: string;
  total: number;
  breakdown: { provider: string; cost: number; label?: string }[];
}

export interface SubagentJob {
  id: string;
  task: string;
  status: RunStatus;
  eta: string;
}

export interface MemoryItem {
  label: string;
  value: string;
  fresh: boolean;
}

export interface AlertRule {
  id: string | number;
  label: string;
  threshold: string;
  active: boolean;
  triggered: boolean;
}
