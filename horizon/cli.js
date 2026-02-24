#!/usr/bin/env node
/**
 * Horizon CLI
 * Command-line interface for Horizon operations
 */

const { routeDecision, getMode, getLLMProvider } = require('./router/policy');
const { runAudit } = require('./skills/audit-coverage');
const { analyzeShadowTests, SHADOW_CONFIG } = require('./skills/shadow-test');
const { getHealth } = require('./runtime/connectivity/agentConnectivity');
const { loadGatewayConfig } = require('./runtime/config/gateway');
const path = require('path');

const COMMANDS = {
  status: showStatus,
  health: showHealth,
  audit: runAudit,
  shadow: analyzeShadow,
  test: testRoute,
  help: showHelp
};

/**
 * Show Horizon status
 */
function showStatus() {
  console.log('\n🌅 Horizon Status\n');
  console.log(`Mode:            ${getMode()}`);
  console.log(`LLM Provider:    ${getLLMProvider()}`);
  console.log(`Shadow Testing:  ${SHADOW_CONFIG.enabled ? 'Enabled' : 'Disabled'}`);
  if (SHADOW_CONFIG.enabled) {
    console.log(`Shadow Rate:     ${(SHADOW_CONFIG.sampleRate * 100).toFixed(1)}%`);
  }
  console.log(`\nTelemetry:       horizon/runtime/telemetry/llm.jsonl`);
  console.log(`Shadow Log:      horizon/runtime/telemetry/llm_shadow.jsonl`);
  console.log('\n');
}

function showHealth() {
  const state = getHealth();
  const gateway = loadGatewayConfig();

  console.log('\n💓 Horizon Health\n');
  console.log(`Agent:           ${state.agentName}`);
  console.log(`Status:          ${state.status}`);
  console.log(`Breaker Open:    ${state.breakerOpen ? 'Yes' : 'No'}`);
  console.log(`Failures:        ${state.consecutiveFailures || 0}`);
  console.log(`Last Heartbeat:  ${state.lastHeartbeatAt || 'n/a'}`);
  console.log(`Last Response:   ${state.lastResponseAt || 'n/a'}`);
  console.log(`Last Success:    ${state.lastSuccessfulAt || 'n/a'}`);
  console.log(`Gateway:         ${gateway.url}`);
  console.log(`Gateway Token:   ${gateway.tokenPresent ? 'present' : 'missing'}`);
  console.log('\n');
}

/**
 * Analyze shadow test results
 */
function analyzeShadow() {
  const logPath = path.join(__dirname, 'runtime/telemetry/llm_shadow.jsonl');
  const analysis = analyzeShadowTests(logPath);
  
  if (!analysis) {
    console.log('\n[Horizon] No shadow test data found. Enable shadow testing first.\n');
    return;
  }

  console.log('\n🔬 Shadow Test Analysis\n');
  console.log(`Total Tests:     ${analysis.totalTests}`);
  console.log(`\nWin Rates:`);
  console.log(`  Local:         ${analysis.winRate.local}`);
  console.log(`  Anthropic:     ${analysis.winRate.anthropic}`);
  console.log(`  Tie:           ${analysis.winRate.tie}`);
  console.log(`\nAvg Latency:`);
  console.log(`  Local:         ${analysis.avgLatency.local}ms`);
  console.log(`  Anthropic:     ${analysis.avgLatency.anthropic}ms`);
  console.log(`\nCost Savings:    $${analysis.totalCostSavings}`);
  console.log('\n');
}

/**
 * Test routing with sample input
 */
function testRoute() {
  const input = process.argv[3] || 'deploy to production';
  
  console.log(`\n🧪 Testing Route\n`);
  console.log(`Input:   "${input}"\n`);

  const decision = routeDecision({
    input,
    aliasMatched: false,
    skillMatched: false,
    userWantsExplainOnly: false
  });

  console.log(`Result:`);
  console.log(`  Route:         ${decision.route}`);
  console.log(`  Reason:        ${decision.reason}`);
  console.log(`  Provider:      ${decision.provider || 'N/A'}`);
  console.log(`  Request ID:    ${decision.requestId}`);
  console.log(`\n`);
}

/**
 * Show help
 */
function showHelp() {
  console.log(`
🌅 Horizon CLI

Usage:
  node horizon/cli.js <command> [args]

Commands:
  status      Show current Horizon configuration and status
  health      Show Horizon runtime connectivity health
  audit       Run skill coverage audit (analyze telemetry logs)
  shadow      Analyze shadow test results (local vs Anthropic)
  test [text] Test routing decision with sample input
  help        Show this help message

Examples:
  node horizon/cli.js status
  node horizon/cli.js audit
  node horizon/cli.js test "create a new user"

Environment Variables:
  HORIZON_MODE              strict | hybrid | bootstrap (default: hybrid)
  LLM_PROVIDER              local | anthropic (default: local)
  HORIZON_SHADOW_ENABLED    true | false (default: false)
  HORIZON_SHADOW_RATE       0.0 - 1.0 (default: 0.1)

Documentation:
  horizon/docs/SETUP.md
  horizon/docs/ARCHITECTURE.md

  `);
}

/**
 * Main CLI entry point
 */
function main() {
  const command = process.argv[2] || 'help';
  const handler = COMMANDS[command];

  if (!handler) {
    console.error(`\n[Horizon] Unknown command: ${command}\n`);
    showHelp();
    process.exit(1);
  }

  try {
    handler();
  } catch (err) {
    console.error(`\n[Horizon] Error:`, err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main };
