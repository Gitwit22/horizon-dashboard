/**
 * handleLLMWithRouting.js
 * 
 * Complete LLM handling with model routing, validation, escalation, and logging
 * Integrates Phase 0-2 validation + model router + escalation confidence
 */

const path = require('path');
const { loadIdentity, buildSystemPrompt, getEmergencySystemMessage } = require('../identity-loader');
const { logLLMEvent } = require('../runtime/telemetry/logger');
const { applyPlainTextGate } = require('../runtime/validators/plainTextGate');
const { validateAssistantOutput } = require('../runtime/validators/assistantOutputValidator');
const { escalateIfNeeded } = require('./escalateIfNeeded');
const { logInteraction } = require('../runtime/logging/teacherCaptureLog');
const { routeModel } = require('./modelRouter');
const { checkEscalation } = require('./escalationConfidence');
const { captureInteraction } = require('../runtime/distill/capture');
const { sanitizeOutput, detectLeaks } = require('./outputSanitizer');
const { buildPromptWithContext } = require('../runtime/knowledge/rag');
const { gateTools, hasTools, stripTools, getToolDetectionDiagnostics } = require('./toolGate');
const { loadGatewayConfig } = require('../runtime/config/gateway');
const { invokeWithRetry, markOffline, recordHeartbeat } = require('../runtime/connectivity/agentConnectivity');

const TOOLISH_KEYS = ['tools', 'tool_choice', 'functions', 'function_call', 'toolSchemas'];

function deepCloneSafe(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function stripToolishFieldsDeep(value) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) stripToolishFieldsDeep(item);
    return;
  }

  for (const key of TOOLISH_KEYS) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      delete value[key];
    }
  }

  for (const nested of Object.values(value)) {
    stripToolishFieldsDeep(nested);
  }
}

function sanitizeCtxForOllama(baseCtx) {
  const safeCtx = deepCloneSafe(baseCtx) || {};
  stripToolishFieldsDeep(safeCtx);
  return safeCtx;
}

function isToolsUnsupportedError(err) {
  const status = err?.status || err?.statusCode || err?.response?.status;
  const message = (err?.message || '').toLowerCase();
  return status === 400 && message.includes('does not support tools');
}

/**
 * Handle LLM call with routing, validation, and escalation
 */
async function handleLLMWithRouting(decision, ctx, originalHandler, getRegistry) {
  const startTime = Date.now();
  let routing = null;
  const requestId = decision?.meta?.requestId || `req_${Date.now()}`;
  const gatewayConfig = loadGatewayConfig();

  const callPrimary = async (prompt, callType, execCtx) => {
    recordHeartbeat('horizon', '1.0.0');
    return invokeWithRetry(
      () => originalHandler(prompt, execCtx),
      {
        agentName: 'horizon',
        requestId,
        transport: `gateway-http:${callType}`,
        url: gatewayConfig.url,
        maxRetries: 5,
        baseDelayMs: 250,
        maxDelayMs: 10_000,
        breakerFailureThreshold: 5,
      }
    );
  };

  try {
    // ========== PHASE 1: MODEL ROUTING ==========
    // Route the request based on complexity/risk signals
    // Detect if tools are actually present in the request
    const toolsRequested = hasTools(decision);
    routing = routeModel({
      input: decision.llm.prompt,
      sessionId: ctx.sessionId || ctx.sessionKey || 'unknown',
      decision: decision
    });
    routing.toolsRequested = toolsRequested;

    console.log(`[Routing] ${routing.reason}: ${routing.model}`, {
      complexity: routing.complexity_signals || [],
      risk: routing.risk_signals || []
    });

    // If risk signal detected and not overridden, return explanation request
    if (routing.model === 'explain') {
      return {
        text: routing.message,
        approvalRequired: true,
        riskSignals: routing.risk_signals,
        instruction: 'Please review this request. Use /approve to proceed or /deny to cancel.',
        model: 'system'
      };
    }

    // ========== PHASE 1.5: TOOL GATE (HARD BLOCK) ==========
    // Ensure tools never reach incompatible models
    if (process.env.DIAG === 'true') {
      const toolDiag = getToolDetectionDiagnostics(decision);
      console.log('[ToolGate][DIAG] pre-gate', {
        model: routing.model,
        toolsRequested,
        detectedPaths: toolDiag.detectedPaths,
        hits: toolDiag.hits,
        decisionKeys: toolDiag.decisionKeys,
      });
    }

    const gateResult = gateTools(decision, routing.model);
    if (!gateResult.allowed) {
      console.error(`[ToolGate] BLOCKED: ${gateResult.reason}`);
      return {
        text: `Cannot proceed: ${gateResult.reason}`,
        error: true,
        code: 'TOOL_INCOMPATIBILITY'
      };
    }

    // ========== PHASE 2: SYSTEM PROMPT SETUP ==========
    let prompt = decision.llm.prompt;
    let systemMessage = null;

    try {
      const agentFolder =
        process.env.ACTIVE_AGENT_FOLDER ||
        path.resolve(__dirname, "..", "..", "agents", "apex");

      const identity = await loadIdentity(agentFolder);
      systemMessage = buildSystemPrompt(identity);

      if (systemMessage) {
        prompt = `[SYSTEM]\n${systemMessage}\n\n[USER]\n${decision.llm.prompt}`;
      }
    } catch (err) {
      try {
        const emergency = getEmergencySystemMessage();
        systemMessage = emergency;
        prompt = `[SYSTEM]\n${systemMessage}\n\n[USER]\n${decision.llm.prompt}`;
        console.error(`[Horizon] Identity load failed; using emergency system message:`, err.message);
      } catch (innerErr) {
        console.error(`[Horizon] Emergency system message unavailable. Blocking LLM call.`, innerErr.message);
        return {
          text: "Identity integrity check failed; service temporarily locked. Administrator action required.",
          error: true,
          code: "IDENTITY_INTEGRITY_LOCKED"
        };
      }
    }

    // ========== PHASE 3: LLM EXECUTION (PRIMARY MODEL) ==========
    // Execute with chosen model; inject RAG context for local models
    // Defensive fallback if tools error
    let result;
    let lastError = null;
    let usedFallback = false;
    let finalPrompt = prompt; // Start with original prompt
    let ragInfo = { used: false, sources: [], charCount: 0 }; // Track RAG usage

    // For local models, inject RAG context
    const isLocalModel = ['deepseek', 'llama'].includes(routing.model);
    if (isLocalModel) {
      const ragPrompt = buildPromptWithContext(decision.llm.prompt, {
        systemPrompt: systemMessage || ''
      });
      finalPrompt = ragPrompt.prompt;
      ragInfo = {
        used: ragPrompt.datasetUsed,
        sources: ragPrompt.datasetSources,
        charCount: ragPrompt.datasetCharCount
      };
    }

    const ollamaBoundaryCtx = isLocalModel ? sanitizeCtxForOllama(ctx) : ctx;

    if (isLocalModel && process.env.DIAG === 'true') {
      console.log('[ToolGate][DIAG] ollama boundary enforced', {
        requestId,
        model: routing.model,
        removedToolFields: TOOLISH_KEYS,
      });
    }

    try {
      result = await callPrimary(finalPrompt, 'primary', ollamaBoundaryCtx);
    } catch (err) {
      // Boundary retry: tools unsupported at provider boundary
      if (isToolsUnsupportedError(err)) {
        console.warn(`[Horizon] ${routing.model} rejected tools (400). Retrying same model with tool-free payload.`);
        usedFallback = true;
        lastError = err.message;
        routing.fallbackReason = 'retry_without_tools';

        try {
          result = await callPrimary(finalPrompt, 'retry_without_tools', sanitizeCtxForOllama(ctx));
        } catch (retryErr) {
          console.warn(`[Horizon] Retry without tools failed. Falling back to Llama.`);
          usedFallback = true;
          lastError = retryErr.message;
          routing.fallbackTo = 'llama';
          routing.fallbackReason = 'deepseek_tools_unsupported';

          try {
            const fallbackRagPrompt = buildPromptWithContext(decision.llm.prompt, {
              systemPrompt: systemMessage || '',
              includeContext: true
            });
            result = await callPrimary(
              fallbackRagPrompt.prompt,
              'fallback_llama',
              sanitizeCtxForOllama(ctx)
            );
            ragInfo = {
              used: fallbackRagPrompt.datasetUsed,
              sources: fallbackRagPrompt.datasetSources,
              charCount: fallbackRagPrompt.datasetCharCount
            };
          } catch (fallbackErr) {
            console.error(`[Horizon] Fallback failed:`, fallbackErr.message);
            throw new Error(`Both primary and fallback models failed: ${fallbackErr.message}`);
          }
        }
      } else if (err.message && err.message.includes('does not support tools')) {
        console.warn(`[Horizon] Model "${routing.model}" does not support tools. Falling back to Llama.`);
        usedFallback = true;
        lastError = err.message;
        routing.fallbackTo = 'llama';
        routing.fallbackReason = 'deepseek_tools_unsupported';
        
        // Retry with fallback: inject RAG context for Llama
        try {
          const fallbackRagPrompt = buildPromptWithContext(decision.llm.prompt, {
            systemPrompt: systemMessage || '',
            includeContext: true // Force context for fallback
          });
          result = await callPrimary(fallbackRagPrompt.prompt, 'fallback_llama', sanitizeCtxForOllama(ctx));
          // Update RAG info with fallback context
          ragInfo = {
            used: fallbackRagPrompt.datasetUsed,
            sources: fallbackRagPrompt.datasetSources,
            charCount: fallbackRagPrompt.datasetCharCount
          };
        } catch (fallbackErr) {
          console.error(`[Horizon] Fallback failed:`, fallbackErr.message);
          throw new Error(`Both primary and fallback models failed: ${fallbackErr.message}`);
        }
      } else {
        // Unrelated error, rethrow
        throw err;
      }
    }

    // ========== PHASE 4: OUTPUT VALIDATION GATE ==========
    const gatedResult = applyPlainTextGate(result, {
      skillMatched: decision.meta?.skillMatched || false
    });

    const validation = validateAssistantOutput(gatedResult.text, {
      skillRegistry: await getRegistry().then(r => r?.getAllSkills() || []).catch(() => []),
      hasExecutedSkill: decision.meta?.skillMatched || false
    });

    // ========== PHASE 5: ESCALATION CONFIDENCE CHECK ==========
    let escalationResult = { escalated: false };
    let escalationConfidence = null;

    // Only check escalation if configured to do so
    if (routing.escalateIfHaikuUnsure && routing.model === 'haiku') {
      escalationConfidence = checkEscalation(gatedResult.text, {
        complexity_signals: routing.complexity_signals,
        risk_signals: routing.risk_signals
      });

      if (escalationConfidence.shouldEscalate) {
        console.log(`[Escalation] Haiku uncertain, escalating to DeepSeek:`, {
          reason: escalationConfidence.reason,
          confidence: escalationConfidence.confidence
        });

        // Escalate to DeepSeek (via escalateIfNeeded)
        escalationResult = await escalateIfNeeded({
          input: decision.llm.prompt,
          systemPrompt: systemMessage || '',
          localOutput: gatedResult.text,
          validationResult: escalationConfidence,
          ctx: ctx,
          originalHandler: originalHandler
        });
      }
    }

    // ========== PHASE 6: VALIDATION-BASED ESCALATION ==========
    // If validation failed and we haven't escalated yet, try escalation
    if (!escalationResult.escalated && !validation.ok) {
      escalationResult = await escalateIfNeeded({
        input: decision.llm.prompt,
        systemPrompt: systemMessage || '',
        localOutput: gatedResult.text,
        validationResult: validation,
        ctx: ctx,
        originalHandler: originalHandler
      });
    }

    // ========== PHASE 7: LOGGING ==========
    const finalOutput = escalationResult.output || gatedResult.text;

    logInteraction({
      sessionId: ctx.sessionId || ctx.sessionKey || 'unknown',
      channel: ctx.channel || 'telegram',
      userInput: decision.llm.prompt,
      systemPrompt: systemMessage || '',
      localModel: decision.llm.model || ctx.model || 'haiku',
      localOutput: gatedResult.text,
      localValidation: validation,
      teacherUsed: escalationResult.escalated || false,
      teacherModel: process.env.ANTHROPIC_TEACHER_MODEL || 'claude-sonnet-4-5',
      teacherOutput: escalationResult.escalated ? escalationResult.output : null,
      escalationReasons: escalationResult.escalationReason || [],
      routing: {
        chosen_model: routing.model,
        reason: routing.reason,
        complexity_signals: routing.complexity_signals || [],
        risk_signals: routing.risk_signals || []
      },
      skillUsed: decision.meta?.skillMatched || false,
      skillName: decision.skill?.name || null,
      approvalRequired: false
    });

    // ========== PHASE 8: TELEMETRY ==========
    // Map routing model to provider
    const routeToProvider = (model) => {
      if (model === 'haiku' || model === 'sonnet' || model === 'opus') return 'anthropic';
      if (model === 'deepseek' || model === 'llama') return 'local';
      if (model === 'explain') return 'system';
      return 'unknown';
    };

    logLLMEvent({
      mode: process.env.HORIZON_MODE || 'hybrid',
      route: 'llm',
      provider: routeToProvider(routing.model),
      model: routing.model,
      reason: decision.meta.reason,
      aliasMatched: false,
      skillMatched: false,
      userWantsExplainOnly: false,
      inputHash: null,
      inputPreview: decision.llm.prompt?.substring(0, 160) || null,
      requestId: decision.meta.requestId,
      latencyMs: Date.now() - startTime,
      tokensIn: result.usage?.input_tokens || null,
      tokensOut: result.usage?.output_tokens || null,
      ok: true,
      error: null,
      escalated: escalationResult.escalated || false,
      validationPassed: validation.ok,
      routingReason: routing.reason,
      chosenModel: routing.model
    });

    // ========== PHASE 9: TRAINING DATA CAPTURE ==========
    // Capture for distill dataset (learning system)
    // Use RAG info computed in Phase 3
    const datasetInfo = ragInfo;

    try {
      captureInteraction({
        requestId: decision.meta.requestId,
        sessionId: ctx.sessionId || ctx.sessionKey || 'unknown',
        input: {
          user: decision.llm.prompt,
          systemPrompt: systemMessage || ''
        },
        routing: {
          overrideRequested: decision?.overrideCommand ? true : false,
          overrideHonored: routing.override || false,
          toolsRequested: routing.toolsRequested || false,
          chosenModel: routing.model,
          reason: routing.reason,
          fallbackTo: routing.fallbackTo || null,
          fallbackReason: routing.fallbackReason || null,
          complexitySignals: routing.complexity_signals || [],
          riskSignals: routing.risk_signals || []
        },
        localOutput: {
          model: routing.model,
          text: finalOutput,
          tokensIn: result.usage?.input_tokens || null,
          tokensOut: result.usage?.output_tokens || null,
          latencyMs: Date.now() - startTime
        },
        teacherOutput: escalationResult.escalated ? {
          model: process.env.ANTHROPIC_TEACHER_MODEL || 'claude-sonnet-4-5',
          text: escalationResult.output,
          tokensIn: null,
          tokensOut: null
        } : null,
        validation: {
          passed: validation.ok,
          reasons: validation.reasons || []
        },
        decision: decision,
        dataset: datasetInfo
      });
    } catch (err) {
      console.warn('[Distill] Capture failed:', err.message);
    }

    // ========== SANITIZE OUTPUT ==========
    // Remove any model/provider names or internal routing details
    const sanitized = sanitizeOutput(finalOutput, {
      model: routing.model,
      provider: routeToProvider(routing.model),
      routing: routing.reason
    });

    // Warn if leakage detected (for monitoring)
    const leakageCheck = detectLeaks(sanitized);
    if (leakageCheck.leaked) {
      console.warn('[Security] Output leaks internal details:', leakageCheck.issues);
    }

    // ========== RETURN FINAL RESPONSE ==========
    return {
      ...result,
      text: sanitized,
      escalated: escalationResult.escalated || false,
      validationPassed: validation.ok,
      validationReasons: validation.reasons,
      routing: {
        chosen: routing.model,
        reason: routing.reason,
        fallback: usedFallback,
        fallbackReason: lastError
      }
    };
  } catch (err) {
    console.error('[handleLLMWithRouting] Error:', err);
    markOffline(`llm_pipeline_error: ${err.message}`);
    
    // Map routing model to provider (same as success path)
    const routeToProvider = (model) => {
      if (model === 'haiku' || model === 'sonnet' || model === 'opus') return 'anthropic';
      if (model === 'deepseek' || model === 'llama') return 'local';
      if (model === 'explain') return 'system';
      return 'unknown';
    };

    logLLMEvent({
      mode: process.env.HORIZON_MODE || 'hybrid',
      route: 'llm',
      provider: routing ? routeToProvider(routing.model) : 'unknown',
      model: routing ? routing.model : null,
      reason: decision?.meta?.reason,
      aliasMatched: false,
      skillMatched: false,
      userWantsExplainOnly: false,
      inputHash: null,
      inputPreview: null,
      requestId,
      latencyMs: Date.now() - startTime,
      tokensIn: null,
      tokensOut: null,
      ok: false,
      error: err.message
    });

    throw err;
  }
}

module.exports = { handleLLMWithRouting };
