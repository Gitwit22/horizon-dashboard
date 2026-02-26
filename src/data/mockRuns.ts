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

const now = new Date();
const ago = (mins: number) => new Date(now.getTime() - mins * 60000).toISOString();

export const mockRuns: Run[] = [
  {
    id: "run_8f3a2b",
    status: "success",
    startedAt: ago(12),
    finishedAt: ago(11),
    durationMs: 4230,
    channel: "telegram",
    userId: "user_291",
    agent: "horizon-main",
    lane: "general",
    stepsCount: 5,
    tokensUsed: 2840,
    cost: 0.0042,
    error: null,
    steps: [
      { id: "s1", type: "llm_call", name: "intent_classification", startedAt: ago(12), finishedAt: ago(11.9), durationMs: 620, input: '{"message": "What\'s the weather in NYC?"}', output: '{"intent": "weather_query", "confidence": 0.97}', error: null, retryCount: 0, tokensUsed: 340, cost: 0.0005 },
      { id: "s2", type: "tool_call", name: "weather_api", startedAt: ago(11.9), finishedAt: ago(11.7), durationMs: 1200, input: '{"location": "New York City"}', output: '{"temp": 72, "condition": "sunny"}', error: null, retryCount: 0 },
      { id: "s3", type: "llm_call", name: "response_generation", startedAt: ago(11.7), finishedAt: ago(11.4), durationMs: 1800, input: '{"intent": "weather_query", "data": {"temp": 72}}', output: '{"response": "It\'s 72°F and sunny in NYC right now!"}', error: null, retryCount: 0, tokensUsed: 1200, cost: 0.0018 },
      { id: "s4", type: "skill_call", name: "format_response", startedAt: ago(11.4), finishedAt: ago(11.3), durationMs: 210, input: '{"text": "It\'s 72°F and sunny in NYC right now!"}', output: '{"formatted": "☀️ It\'s 72°F and sunny in NYC right now!"}', error: null, retryCount: 0 },
      { id: "s5", type: "tool_call", name: "telegram_send", startedAt: ago(11.3), finishedAt: ago(11.2), durationMs: 400, input: '{"chat_id": "291", "text": "☀️ ..."}', output: '{"ok": true}', error: null, retryCount: 0 },
    ],
  },
  {
    id: "run_4c7d1e",
    status: "error",
    startedAt: ago(8),
    finishedAt: ago(7),
    durationMs: 6100,
    channel: "telegram",
    userId: "user_583",
    agent: "horizon-main",
    lane: "trading",
    stepsCount: 3,
    tokensUsed: 1560,
    cost: 0.0023,
    error: "TimeoutError: API call exceeded 5000ms limit",
    steps: [
      { id: "s1", type: "llm_call", name: "intent_classification", startedAt: ago(8), finishedAt: ago(7.8), durationMs: 720, input: '{"message": "Buy 0.5 ETH"}', output: '{"intent": "trade_execute", "confidence": 0.92}', error: null, retryCount: 0, tokensUsed: 380, cost: 0.0006 },
      { id: "s2", type: "tool_call", name: "portfolio_check", startedAt: ago(7.8), finishedAt: ago(7.6), durationMs: 880, input: '{"user": "583", "asset": "ETH"}', output: '{"balance": 2.3}', error: null, retryCount: 0 },
      { id: "s3", type: "tool_call", name: "exchange_api", startedAt: ago(7.6), finishedAt: ago(7), durationMs: 5000, input: '{"action": "buy", "amount": 0.5, "asset": "ETH"}', output: null, error: "TimeoutError: API call exceeded 5000ms limit", retryCount: 2 },
    ],
  },
  {
    id: "run_9e2f8a",
    status: "running",
    startedAt: ago(2),
    finishedAt: null,
    durationMs: null,
    channel: "telegram",
    userId: "user_147",
    agent: "horizon-research",
    lane: "analysis",
    stepsCount: 2,
    tokensUsed: 890,
    cost: 0.0013,
    error: null,
    steps: [
      { id: "s1", type: "llm_call", name: "query_analysis", startedAt: ago(2), finishedAt: ago(1.8), durationMs: 950, input: '{"message": "Analyze BTC trend last 7 days"}', output: '{"type": "market_analysis", "timeframe": "7d"}', error: null, retryCount: 0, tokensUsed: 520, cost: 0.0008 },
      { id: "s2", type: "tool_call", name: "market_data_fetch", startedAt: ago(1.8), finishedAt: null, durationMs: null, input: '{"asset": "BTC", "range": "7d"}', output: null, error: null, retryCount: 0 },
    ],
  },
  {
    id: "run_1b5c3d",
    status: "queued",
    startedAt: ago(1),
    finishedAt: null,
    durationMs: null,
    channel: "telegram",
    userId: "user_822",
    agent: "horizon-main",
    lane: "general",
    stepsCount: 0,
    tokensUsed: 0,
    cost: 0,
    error: null,
    steps: [],
  },
  {
    id: "run_6a8e4f",
    status: "success",
    startedAt: ago(25),
    finishedAt: ago(24),
    durationMs: 3100,
    channel: "telegram",
    userId: "user_291",
    agent: "horizon-main",
    lane: "general",
    stepsCount: 3,
    tokensUsed: 1920,
    cost: 0.0029,
    error: null,
    steps: [
      { id: "s1", type: "llm_call", name: "intent_classification", startedAt: ago(25), finishedAt: ago(24.8), durationMs: 580, input: '{"message": "Hello!"}', output: '{"intent": "greeting"}', error: null, retryCount: 0, tokensUsed: 220, cost: 0.0003 },
      { id: "s2", type: "llm_call", name: "response_generation", startedAt: ago(24.8), finishedAt: ago(24.3), durationMs: 2100, input: '{"intent": "greeting"}', output: '{"response": "Hey there! How can I help?"}', error: null, retryCount: 0, tokensUsed: 1700, cost: 0.0026 },
      { id: "s3", type: "tool_call", name: "telegram_send", startedAt: ago(24.3), finishedAt: ago(24.1), durationMs: 420, input: '{"chat_id": "291"}', output: '{"ok": true}', error: null, retryCount: 0 },
    ],
  },
  {
    id: "run_2d7f9c",
    status: "success",
    startedAt: ago(45),
    finishedAt: ago(44),
    durationMs: 5800,
    channel: "telegram",
    userId: "user_410",
    agent: "horizon-research",
    lane: "analysis",
    stepsCount: 4,
    tokensUsed: 4200,
    cost: 0.0063,
    error: null,
    steps: [
      { id: "s1", type: "llm_call", name: "query_analysis", startedAt: ago(45), finishedAt: ago(44.8), durationMs: 700, input: '{"message": "Portfolio summary"}', output: '{"type": "portfolio_summary"}', error: null, retryCount: 0, tokensUsed: 400, cost: 0.0006 },
      { id: "s2", type: "tool_call", name: "portfolio_fetch", startedAt: ago(44.8), finishedAt: ago(44.4), durationMs: 1500, input: '{"user": "410"}', output: '{"assets": ["BTC", "ETH", "SOL"]}', error: null, retryCount: 0 },
      { id: "s3", type: "llm_call", name: "summary_generation", startedAt: ago(44.4), finishedAt: ago(44.1), durationMs: 2800, input: '{"assets": [...]}', output: '{"summary": "Your portfolio is up 3.2%..."}', error: null, retryCount: 0, tokensUsed: 3800, cost: 0.0057 },
      { id: "s4", type: "tool_call", name: "telegram_send", startedAt: ago(44.1), finishedAt: ago(44), durationMs: 380, input: '{"chat_id": "410"}', output: '{"ok": true}', error: null, retryCount: 0 },
    ],
  },
];

export const heartbeatData = {
  lastEventReceived: ago(0.5),
  lastSuccessfulRun: ago(11),
  currentQueueSize: 3,
  activeRuns: 1,
  stuckThresholdSeconds: 120,
  avgResponseTimeMs: 4280,
  totalRunsToday: 47,
  errorRatePercent: 4.2,
};
