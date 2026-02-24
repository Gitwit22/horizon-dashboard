#!/usr/bin/env node
/**
 * llm-attribution.js
 * Horizon telemetry aggregator — tracks LLM routing, fallback rates, and provider mix
 * Usage: node llm-attribution.js --days 1
 *        node llm-attribution.js --from 2026-02-20 --to 2026-02-24
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");

// Parse command line args
function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const val = argv[i + 1];
      if (val && !val.startsWith("--")) {
        args[key] = val;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

// Helpers
function yyyyMmDd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateRange(from, to) {
  const dates = [];
  const d = new Date(from);
  const end = new Date(to);
  while (d <= end) {
    dates.push(yyyyMmDd(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function safeReadDir(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .map((e) => path.join(dir, e.name));
  } catch {
    return [];
  }
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function looksLikeJsonl(p) {
  return p.endsWith(".jsonl") || p.endsWith(".ndjson");
}

function looksLikeJson(p) {
  return p.endsWith(".json");
}

function inc(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function pct(v, total) {
  if (!total) return "0%";
  return `${Math.round((v / total) * 100)}%`;
}

function classifyHandling(rec) {
  if (rec.skill || rec.skillName) return "skill";
  if (rec.localLlm || rec.model === "local") return "local";
  if (rec.provider === "anthropic" || rec.model?.includes("claude")) return "anthropic";
  return "unknown";
}

function normProviderModel(rec) {
  const provider = rec.provider || rec.llmProvider || "unknown";
  const model = rec.model || rec.modelName || "unknown";
  return { provider, model };
}

function subagentKey(rec) {
  const id = rec.subagentId || rec.sessionId || rec.agentId || null;
  const label = rec.subagentLabel || rec.label || null;
  if (id && label) return `${label} (${id})`;
  if (id) return id;
  if (label) return label;
  return "inline";
}

// Read JSONL (streaming)
async function readJsonlFile(filePath, onRecord) {
  const stream = fs.createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const s = line.trim();
    if (!s) continue;
    const firstBrace = s.indexOf("{");
    const candidate = firstBrace >= 0 ? s.slice(firstBrace) : s;
    try {
      const rec = JSON.parse(candidate);
      onRecord(rec);
    } catch {
      // ignore non-json lines
    }
  }
}

// Read JSON (file)
function readJsonFile(filePath, onRecord) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      data.forEach(onRecord);
    } else if (data && typeof data === "object") {
      if (Array.isArray(data.records)) data.records.forEach(onRecord);
      else onRecord(data);
    }
  } catch {
    // ignore
  }
}

function printTop(map, total, title, topN = 12) {
  const rows = [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);
  console.log(`\n=== ${title} (top ${rows.length}) ===`);
  for (const [k, v] of rows) {
    console.log(
      `${String(k).padEnd(42)} ${String(v).padStart(8)} ${pct(v, total)}`
    );
  }
}

// Main
(async function main() {
  const args = parseArgs(process.argv);
  const root = args.root ||
    process.env.NXTLVL_ROOT ||
    process.env.HORIZON_ROOT ||
    process.cwd();

  // Date selection
  const today = new Date();
  const days = args.days ? Math.max(1, Number(args.days)) : null;
  let from = args.from;
  let to = args.to;

  if (!from || !to) {
    if (days) {
      const d0 = new Date(today);
      d0.setDate(d0.getDate() - (days - 1));
      from = yyyyMmDd(d0);
      to = yyyyMmDd(today);
    } else {
      from = yyyyMmDd(today);
      to = yyyyMmDd(today);
    }
  }

  const dates = dateRange(from, to);

  // Common log locations (best-effort)
  const candidates = [
    path.join(root, "horizon", "runtime", "distill", "logs"),
    path.join(root, "runtime", "distill", "logs"),
    path.join(root, "horizon", "runtime", "logs"),
    path.join(root, "runtime", "logs"),
    path.join(root, "horizon", "runtime", "distill", "metrics"),
    path.join(root, "runtime", "distill", "metrics"),
    path.join(root, "horizon", "runtime", "metrics"),
    path.join(root, "runtime", "metrics"),
  ];

  // Expand to files matching date window
  let files = [];
  for (const dir of candidates) {
    const list = safeReadDir(dir).filter(isFile);
    for (const f of list) {
      const base = path.basename(f);
      const match = dates.some((d) => base.includes(d));
      if (match) files.push(f);
    }
  }

  // Fallback: just take recent files
  if (files.length === 0) {
    for (const dir of candidates) {
      const list = safeReadDir(dir).filter(isFile);
      files.push(...list);
    }
    files = files
      .map((p) => ({
        p,
        m: (() => {
          try {
            return fs.statSync(p).mtimeMs;
          } catch {
            return 0;
          }
        })(),
      }))
      .sort((a, b) => b.m - a.m)
      .slice(0, 200)
      .map((x) => x.p);
  }

  // Aggregates
  let total = 0;
  const byHandling = new Map(); // skill / local / anthropic / unknown
  const byProviderModel = new Map(); // "provider :: model"
  const byRouteDecision = new Map(); // "route/decision/outcome"
  const bySubagent = new Map(); // agentId / sessionId
  const byFallbackReason = new Map(); // fallback reasons
  const byDuration = new Map(); // execution duration buckets
  let fallbackCount = 0;
  let totalDuration = 0;
  const seen = new Set(); // dedupe by runId

  function ingest(rec) {
    const key = rec.runId || rec.requestId || rec.id;
    if (key) {
      if (seen.has(key)) return;
      seen.add(key);
    }

    total++;

    // Handling mix
    const handling = classifyHandling(rec);
    inc(byHandling, handling);

    // Provider / Model
    const { provider, model } = normProviderModel(rec);
    inc(byProviderModel, `${provider} :: ${model}`);

    // Route / Decision / Outcome
    const rd =
      (rec.route ? `route=${rec.route}` : "") +
      (rec.decision ? ` decision=${rec.decision}` : "") +
      (rec.outcome ? ` outcome=${rec.outcome}` : "");
    const rdKey = rd.trim() ? rd.trim() : "route/decision unknown";
    inc(byRouteDecision, rdKey);

    // Subagent tracking
    inc(bySubagent, subagentKey(rec));

    // Fallback detection
    const usedFallback =
      rec.fallbackUsed === true ||
      rec.usedFallback === true ||
      (typeof rec.fallback === "string" && rec.fallback.length > 0) ||
      (typeof rec.escalatedTo === "string" && rec.escalatedTo.length > 0) ||
      JSON.stringify(rec).toLowerCase().includes("fallback");

    if (usedFallback) {
      fallbackCount++;
      const reason =
        rec.fallbackReason ||
        rec.why ||
        rec.reason ||
        rec.errorType ||
        rec.error ||
        "unspecified";
      inc(byFallbackReason, String(reason).slice(0, 120));
    }

    // Duration tracking
    if (rec.durationMs || rec.duration) {
      const dur = rec.durationMs || rec.duration;
      totalDuration += dur;
      let bucket = "unknown";
      if (dur < 100) bucket = "0-100ms";
      else if (dur < 500) bucket = "100-500ms";
      else if (dur < 1000) bucket = "500-1000ms";
      else if (dur < 5000) bucket = "1-5s";
      else bucket = "5s+";
      inc(byDuration, bucket);
    }
  }

  // Read files
  const jsonlFiles = files.filter(looksLikeJsonl);
  const jsonFiles = files.filter(looksLikeJson);

  for (const f of jsonlFiles) {
    try {
      await readJsonlFile(f, ingest);
    } catch (e) {
      console.warn(`Warning: Could not read ${f}: ${e.message}`);
    }
  }

  for (const f of jsonFiles) {
    readJsonFile(f, ingest);
  }

  // Output report
  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║     LLM Attribution Report — Horizon Telemetry         ║");
  console.log("╚════════════════════════════════════════════════════════╝\n");

  console.log(`Root:    ${root}`);
  console.log(`Window:  ${from} → ${to}`);
  console.log(`Records: ${total}`);
  console.log(
    `Files:   ${jsonlFiles.length} JSONL + ${jsonFiles.length} JSON\n`
  );

  if (!total) {
    console.log(
      "⚠️  No parsable records found. Ensure runtime is writing JSONL/JSON with provider/model/route fields."
    );
    process.exit(0);
  }

  // Handling Mix
  console.log("╔════════════════════════════════════════════════════════╗");
  console.log("║ Handling Mix                                           ║");
  console.log("╚════════════════════════════════════════════════════════╝");
  for (const k of ["skill", "local", "anthropic", "unknown"]) {
    const v = byHandling.get(k) || 0;
    console.log(`${k.padEnd(10)} ${String(v).padStart(8)} ${pct(v, total)}`);
  }

  // Starvation signals
  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║ Anthropic Starvation Signal                            ║");
  console.log("╚════════════════════════════════════════════════════════╝");
  const anth = byHandling.get("anthropic") || 0;
  const local = byHandling.get("local") || 0;
  const skill = byHandling.get("skill") || 0;
  console.log(`Anthropic share:  ${pct(anth, total)} (${anth}/${total})`);
  console.log(`Local LLM share:  ${pct(local, total)} (${local}/${total})`);
  console.log(`Skill share:      ${pct(skill, total)} (${skill}/${total})`);
  console.log(
    `Fallback rate:    ${pct(fallbackCount, total)} (${fallbackCount}/${total})`
  );

  // Duration breakdown
  if (byDuration.size > 0) {
    console.log("\n╔════════════════════════════════════════════════════════╗");
    console.log("║ Execution Duration Buckets                             ║");
    console.log("╚════════════════════════════════════════════════════════╝");
    const durOrder = ["0-100ms", "100-500ms", "500-1000ms", "1-5s", "5s+"];
    for (const bucket of durOrder) {
      const v = byDuration.get(bucket) || 0;
      if (v > 0) {
        console.log(
          `${bucket.padEnd(12)} ${String(v).padStart(8)} ${pct(v, total)}`
        );
      }
    }
    const avgDur = totalDuration / (byDuration.size);
    console.log(`\nAverage:         ${avgDur.toFixed(0)}ms`);
  }

  // Detailed tables
  printTop(byProviderModel, total, "Provider / Model");
  printTop(bySubagent, total, "Subagents / Sessions");
  printTop(byRouteDecision, total, "Routes / Decisions / Outcomes");

  if (fallbackCount) {
    printTop(byFallbackReason, fallbackCount, "Fallback Reasons", 10);
  }

  console.log(
    "\n✅ Done. Use --days N, --from YYYY-MM-DD, --to YYYY-MM-DD to customize window.\n"
  );
})().catch((e) => {
  console.error("Report failed:", e);
  process.exit(1);
});
