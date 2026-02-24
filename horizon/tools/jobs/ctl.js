#!/usr/bin/env node
/**
 * jobs/ctl.js — Job control CLI
 * Usage:
 *   node jobs/ctl.js list [--status pending|completed|failed]
 *   node jobs/ctl.js status <jobId>
 *   node jobs/ctl.js cancel <jobId> [--force]
 */

const fs = require("fs");
const path = require("path");

const ROOT = process.env.NXTLVL_ROOT || process.cwd();
const JOBS_DIR = path.join(ROOT, "horizon", "runtime", "jobs");
const PENDING_DIR = path.join(JOBS_DIR, "pending");
const COMPLETED_DIR = path.join(JOBS_DIR, "completed");
const FAILED_DIR = path.join(JOBS_DIR, "failed");

// Ensure dirs exist
for (const dir of [PENDING_DIR, COMPLETED_DIR, FAILED_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJob(jobId) {
  for (const dir of [PENDING_DIR, COMPLETED_DIR, FAILED_DIR]) {
    const file = path.join(dir, `${jobId}.json`);
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    }
  }
  return null;
}

function listJobs(statusFilter) {
  const jobs = [];
  for (const dir of [PENDING_DIR, COMPLETED_DIR, FAILED_DIR]) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
      if (!file.name.endsWith(".json")) continue;
      try {
        const job = JSON.parse(fs.readFileSync(path.join(dir, file.name), "utf8"));
        if (statusFilter && job.status !== statusFilter) continue;
        jobs.push(job);
      } catch {}
    }
  }
  return jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function showStatus(jobId) {
  const job = readJob(jobId);
  if (!job) {
    console.error(`Job not found: ${jobId}`);
    process.exit(1);
  }

  const created = new Date(job.createdAt);
  const now = new Date();
  const elapsed = Math.floor((now - created) / 1000);

  console.log(`\n╔════════════════════════════════════════╗`);
  console.log(`║ Job Status: ${jobId.padEnd(30)} ║`);
  console.log(`╚════════════════════════════════════════╝\n`);
  console.log(`Status:     ${job.status}`);
  console.log(`Type:       ${job.type}`);
  console.log(`Created:    ${job.createdAt}`);
  console.log(`Elapsed:    ${elapsed}s`);
  if (job.timeout) console.log(`Timeout:    ${job.timeout}s`);
  if (job.progress) console.log(`Progress:   ${job.progress}`);
  console.log(`Priority:   ${job.priority || "normal"}`);
  console.log(`Session:    ${job.sessionKey || "unknown"}`);

  if (job.completedAt) {
    const completed = new Date(job.completedAt);
    const duration = Math.floor((completed - created) / 1000);
    console.log(`\nCompleted:  ${job.completedAt}`);
    console.log(`Duration:   ${duration}s`);
  }

  if (job.exitCode !== undefined) {
    console.log(`Exit code:  ${job.exitCode}`);
  }

  if (job.result) {
    console.log(`Result:     ${JSON.stringify(job.result)}`);
  }

  if (job.error) {
    console.log(`Error:      ${job.error}`);
  }

  console.log();
}

function cancel(jobId, force = false) {
  const job = readJob(jobId);
  if (!job) {
    console.error(`Job not found: ${jobId}`);
    process.exit(1);
  }

  if (job.status === "completed" || job.status === "failed") {
    console.error(`Job already finished: ${job.status}`);
    process.exit(1);
  }

  // Move to failed
  const pendingPath = path.join(PENDING_DIR, `${jobId}.json`);
  const failedPath = path.join(FAILED_DIR, `${jobId}.json`);

  job.status = "failed";
  job.error = force ? "Forcefully cancelled" : "Gracefully cancelled";
  job.cancelledAt = new Date().toISOString();

  if (fs.existsSync(pendingPath)) fs.unlinkSync(pendingPath);
  fs.writeFileSync(failedPath, JSON.stringify(job, null, 2));

  console.log(`✅ Job cancelled: ${jobId}`);
}

function main() {
  const cmd = process.argv[2];
  const arg1 = process.argv[3];
  const flag = process.argv[4];

  if (!cmd) {
    console.error(
      "Usage: jobs/ctl.js list|status|cancel <jobId> [--status|--force]"
    );
    process.exit(1);
  }

  if (cmd === "list") {
    const statusFilter = flag === "--status" ? arg1 : null;
    const jobs = listJobs(statusFilter);

    if (jobs.length === 0) {
      console.log("No jobs found.");
      return;
    }

    console.log("\n╔════════════════════════════════════════════════════════════════╗");
    console.log("║ Jobs", (statusFilter ? `(${statusFilter})` : "").padEnd(58), "║");
    console.log("╚════════════════════════════════════════════════════════════════╝\n");

    console.log(
      `${"ID".padEnd(15)} ${"Status".padEnd(12)} ${"Type".padEnd(12)} ${"Created".padEnd(20)} ${"Priority"}`
    );
    console.log("-".repeat(70));

    for (const job of jobs) {
      const created = new Date(job.createdAt).toLocaleString("en-US", {
        timeZone: "America/New_York",
      });
      console.log(
        `${(job.jobId || "?").padEnd(15)} ${(job.status || "?").padEnd(12)} ${(job.type || "?").padEnd(12)} ${created.padEnd(20)} ${job.priority || "normal"}`
      );
    }
    console.log();
  } else if (cmd === "status") {
    if (!arg1) {
      console.error("Usage: jobs/ctl.js status <jobId>");
      process.exit(1);
    }
    showStatus(arg1);
  } else if (cmd === "cancel") {
    if (!arg1) {
      console.error("Usage: jobs/ctl.js cancel <jobId> [--force]");
      process.exit(1);
    }
    const force = flag === "--force";
    cancel(arg1, force);
  } else {
    console.error(`Unknown command: ${cmd}`);
    process.exit(1);
  }
}

main();
