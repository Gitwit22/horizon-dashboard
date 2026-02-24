/**
 * Horizon Production Wrapper (Option C)
 * 
 * Wraps your existing Clawdbot message handler with Horizon routing.
 * Zero core edits. Easily reversible. Single call site.
 * 
 * USAGE:
 * 1. Import this wrapper
 * 2. Pass your existing handler as the fallback
 * 3. Use the wrapped version instead of your original
 * 
 * ROLLBACK:
 * Comment out the wrapper call and use your original handler directly.
 */

const { route, getRegistry } = require("./index");
const { parseCommandAndArgs } = require("./skill-registry");
const { logLLMEvent } = require("./runtime/telemetry/logger");
const { formatSkillResult, withVoice } = require("./response-presenter");
const { loadIdentity, buildSystemPrompt, getEmergencySystemMessage } = require("./identity-loader");
const { handleLLMWithRouting } = require("./router/handleLLMWithRouting");
const { loadGatewayConfig, logGatewayStartup } = require('./runtime/config/gateway');
const { installCrashProtection } = require('./runtime/connectivity/crashProtection');
const { recordHeartbeat, markOffline } = require('./runtime/connectivity/agentConnectivity');
const path = require("path");

let startupInitialized = false;

function ensureStartupInitialized() {
  if (startupInitialized) return;
  startupInitialized = true;

  const gatewayConfig = loadGatewayConfig();
  logGatewayStartup(gatewayConfig);
  installCrashProtection('horizon');
}

/**
 * Create a Horizon-wrapped message handler
 * 
 * @param {Function} originalHandler - Your existing Clawdbot message handler
 * @param {Object} options - Configuration options
 * @returns {Function} - Wrapped handler
 */
function createHorizonWrapper(originalHandler, options = {}) {
  const {
    skillExecutor = null,
    enabled = true,
    debugLog = false
  } = options;

  /**
   * Wrapped handler
   */
  return async function horizonWrappedHandler(input, ctx) {
    ensureStartupInitialized();
    recordHeartbeat('horizon', '1.0.0');

    // If wrapper disabled, bypass Horizon entirely
    if (!enabled) {
      if (debugLog) console.log("[Horizon] Wrapper disabled, using original handler");
      return await originalHandler(input, ctx);
    }

    try {
      // Get routing decision
      const decision = await route({ input, ctx });

      if (debugLog) {
        console.log(`[Horizon] Decision:`, {
          type: decision.type,
          mode: decision.meta?.mode,
          reason: decision.meta?.reason,
          requestId: decision.meta?.requestId
        });
      }

      // INVARIANT CHECK: Prevent regression
      if (
        (decision.meta?.aliasMatched || decision.meta?.skillMatched) &&
        decision.type === "llm"
      ) {
        throw new Error(
          `[Horizon] INVARIANT VIOLATED: skill/alias matched but routed to LLM. ` +
            `RequestId: ${decision.meta?.requestId}`
        );
      }

      // Route based on decision type
      switch (decision.type) {
        case "skill": {
          return await handleSkill(decision, ctx, skillExecutor, originalHandler);
        }

        case "llm": {
          return await handleLLMWithRouting(decision, ctx, originalHandler, getRegistry);
        }

        case "blocked": {
          return {
            text: decision.message,
            blocked: true,
            meta: decision.meta
          };
        }

        default: {
          // Unknown decision type — fail closed
          console.error(`[Horizon] Unknown decision type: ${decision.type}`);
          return {
            text: "Routing failed (fail-closed). Check telemetry.",
            error: true,
            meta: decision.meta
          };
        }
      }
    } catch (err) {
      // Horizon routing failed — log and fall back to original handler
      console.error(`[Horizon] Wrapper error:`, err);
      markOffline(`wrapper_error: ${err.message}`);
      console.error(`[Horizon] Falling back to original handler`);
      return await originalHandler(input, ctx);
    }
  };
}

/**
 * Handle skill execution
 * FAIL-CLOSED: If skill is known (matched), execution is mandatory.
 * No fallback to LLM for matched skills.
 */
async function handleSkill(decision, ctx, skillExecutor, originalHandler) {
  // INVARIANT: If we got here, skill was matched. Must execute or hard-error.
  const skillName = decision.skill?.name || decision.skill?.skillName;
  const commandName = decision.skill?.command;
  const isAliasMatch = decision.meta?.aliasMatched || false;

  if (!skillExecutor) {
    // No external executor provided — try registry
    try {
      const reg = await getRegistry();
      if (!reg || !skillName) {
        // This should never happen if routing was correct
        const msg = `[Horizon] INVARIANT VIOLATION: Skill matched but no registry or skillName`;
        console.error(msg);
        return {
          text: msg,
          error: true,
          code: "EXECUTOR_NOT_FOUND"
        };
      }

      const exec = reg.getExecutor(skillName);
      if (!exec) {
        // Known skill but no executor — hard failure (FAIL-CLOSED)
        const msg = `[Horizon] FAIL-CLOSED: Skill '${skillName}' matched but executor not found. This is a critical error—check skill.json and module exports.`;
        console.error(msg);
        return {
          text: msg,
          error: true,
          code: "SKILL_EXECUTOR_MISSING",
          skillName,
          isAliasMatch
        };
      }

      // Parse command and args from input if available
      const { cmd, args } = parseCommandAndArgs(commandName || "");

      // Approval gate: if requiresApproval, return for approval flow
      if (decision.skill?.requiresApproval) {
        return {
          ok: false,
          approvalRequired: true,
          command: commandName,
          skillName: skillName,
          risk: decision.skill?.risk
        };
      }

      // Execute skill and return result directly (no LLM fallback)
      const result = await exec(commandName, args, ctx);
      
      // Format result for Telegram using presenter
      if (result && !result.error) {
        const formattedText = formatSkillResult(skillName, result, commandName);
        const withPersonality = withVoice(formattedText);
        return {
          ...result,
          text: withPersonality,
          formatted: true
        };
      }
      
      return result;
    } catch (err) {
      // Skill execution threw an error — hard failure (FAIL-CLOSED, not LLM)
      console.error(`[Horizon] FAIL-CLOSED: Skill execution error for '${skillName}':`, err);
      return {
        text: `Skill execution failed: ${err.message}`,
        error: true,
        code: "SKILL_EXECUTION_ERROR",
        skillName,
        originalError: err.message
      };
    }
  }

  // External skillExecutor provided (legacy path)
  try {
    const result = await skillExecutor(decision.skill.name, decision.skill.args, ctx);
    return result;
  } catch (err) {
    console.error(`[Horizon] External skill execution failed:`, err);
    return {
      text: `Skill execution failed: ${err.message}`,
      error: true,
      code: "SKILL_EXECUTION_ERROR"
    };
  }
}

/**
 * Handle LLM call with telemetry + Phase 0-2 validation pipeline
 */
module.exports = {
  createHorizonWrapper
};
