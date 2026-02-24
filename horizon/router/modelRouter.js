/**
 * modelRouter.js
 * 
 * Two-part routing gate: Complexity + Risk signals
 * Routes Haiku → DeepSeek → Approval/Skills as needed
 * Budget-aware: If Anthropic disabled, downgrades paid models to local
 */

const { isAnthropicEnabled } = require('../runtime/config/providers');

/**
 * Parse manual override commands from input
 * @param {string} input 
 * @returns {string|null} - 'haiku', 'deepseek', 'llama', 'explain', or null
 */
function parseManualOverride(input) {
  if (!input || typeof input !== 'string') return null;
  
  // Check for override commands: @model, !model, /model
  const overrideMatch = input.match(/^[\/@!](haiku|deepseek|llama|think|explain|dryrun)/i);
  
  if (overrideMatch) {
    const cmd = overrideMatch[1].toLowerCase();
    if (cmd === 'think') return 'deepseek';
    if (cmd === 'explain' || cmd === 'dryrun') return 'explain';
    return cmd;
  }
  
  return null;
}

/**
 * Detect complexity signals that warrant DeepSeek
 * @param {string} input 
 * @returns {string[]|null} - array of matched signals, or null
 */
function detectComplexitySignals(input) {
  if (!input || typeof input !== 'string') return null;
  
  const signals = [];
  const lowerInput = input.toLowerCase();
  
  // A1: Multi-step output keywords
  const multiStepKeywords = [
    'plan', 'strategy', 'roadmap', 'step-by-step', 'steps', 'algorithm', 
    'design', 'architecture', 'refactor', 'migration', 'debug', 
    'root cause', 'compare', 'tradeoffs', 'trade-offs', 'pros and cons'
  ];
  
  for (const keyword of multiStepKeywords) {
    if (lowerInput.includes(keyword)) {
      signals.push('MULTI_STEP');
      break;
    }
  }
  
  // A2: Constraint satisfaction
  const constraintPatterns = [
    /\bmust\b/, /\bcannot\b/, /\bonly if\b/, /\bkeep consistent\b/, 
    /\bsatisfy all\b/, /\ball of these\b/, /\brequires that\b/
  ];
  
  for (const pattern of constraintPatterns) {
    if (pattern.test(lowerInput)) {
      signals.push('CONSTRAINT_SATISFACTION');
      break;
    }
  }
  
  // A3: Long reasoning depth (3+ question marks)
  const questionMarkCount = (input.match(/\?/g) || []).length;
  if (questionMarkCount >= 3) {
    signals.push('MULTIPLE_QUESTIONS');
  }
  
  // A3b: Multiple domains (security, networking, deployment, etc.)
  const domainKeywords = [
    'security', 'networking', 'deployment', 'infrastructure', 'architecture',
    'database', 'api', 'auth', 'performance', 'scalability', 'reliability'
  ];
  const mentionedDomains = domainKeywords.filter(d => lowerInput.includes(d)).length;
  if (mentionedDomains >= 2) {
    signals.push('MULTI_DOMAIN');
  }
  
  // A4: Prove/derive/calculate type tasks
  const proveDeriveKeywords = [
    'prove', 'derive', 'complexity', 'edge cases', 'formal', 'correctness',
    'verify', 'validate', 'calculate', 'compute', 'mathematical'
  ];
  
  for (const keyword of proveDeriveKeywords) {
    if (lowerInput.includes(keyword)) {
      signals.push('PROVE_DERIVE');
      break;
    }
  }
  
  return signals.length > 0 ? signals : null;
}

/**
 * Detect risk signals (require approval/skill-first/explanation-only)
 * @param {string} input 
 * @returns {string[]|null} - array of risk signals
 */
function detectRiskSignals(input) {
  if (!input || typeof input !== 'string') return null;
  
  const signals = [];
  const lowerInput = input.toLowerCase();
  
  // Risk: State-changing operations
  const stateChangePatterns = [
    /\b(?:write|delete|remove|create|update|modify|change)\b.*(?:file|config|database|record)/i,
    /\bgit\b.*(?:push|commit|delete|reset)/i,
    /\b(?:chmod|rm|mv|cp|mkdir|touch)\b/i,
    /\bshell\b.*command/i,
    /\bexecute\b.*command/i
  ];
  
  for (const pattern of stateChangePatterns) {
    if (pattern.test(input)) {
      signals.push('STATE_CHANGE');
      break;
    }
  }
  
  // Risk: Auth/secrets/credentials
  const authPatterns = [
    /\b(?:token|secret|key|password|credential|api[_-]?key|apikey)\b/i,
    /\b(?:bearer|oauth|jwt|auth)/i,
    /\b(?:private|confidential|sensitive|restricted)\b/i
  ];
  
  for (const pattern of authPatterns) {
    if (pattern.test(input)) {
      signals.push('AUTH_RISK');
      break;
    }
  }
  
  // Risk: Network exposure
  if (/\b(?:expose|open|port|firewall|network|ssl|https|encryption)\b/i.test(input)) {
    signals.push('NETWORK_RISK');
  }
  
  return signals.length > 0 ? signals : null;
}

/**
 * Check if request requires tools/function calling
 * @param {object} decision - The routing decision or context object
 * @returns {boolean} - True if tools are needed
 */
function hasToolsRequested(decision) {
  if (!decision) return false;

  const detect = detectToolPaths(decision);
  return detect.toolsRequested;
}

function detectToolPaths(decision) {
  const hits = {
    'decision.tools': Array.isArray(decision?.tools) ? decision.tools.length > 0 : !!decision?.tools,
    'decision.toolSchemas': Array.isArray(decision?.toolSchemas) ? decision.toolSchemas.length > 0 : !!decision?.toolSchemas,
    'decision.llm.tools': Array.isArray(decision?.llm?.tools) ? decision.llm.tools.length > 0 : !!decision?.llm?.tools,
    'decision.llm.toolSchemas': Array.isArray(decision?.llm?.toolSchemas) ? decision.llm.toolSchemas.length > 0 : !!decision?.llm?.toolSchemas,
    'decision.meta.tools': Array.isArray(decision?.meta?.tools) ? decision.meta.tools.length > 0 : !!decision?.meta?.tools,
    'decision.meta.toolSchemas': Array.isArray(decision?.meta?.toolSchemas) ? decision.meta.toolSchemas.length > 0 : !!decision?.meta?.toolSchemas,
    'decision.request.tools': Array.isArray(decision?.request?.tools) ? decision.request.tools.length > 0 : !!decision?.request?.tools,
    'decision.request.toolSchemas': Array.isArray(decision?.request?.toolSchemas) ? decision.request.toolSchemas.length > 0 : !!decision?.request?.toolSchemas,
  };

  return {
    hits,
    paths: Object.keys(hits).filter((k) => hits[k]),
    toolsRequested: Object.values(hits).some(Boolean),
  };
}

/**
 * Check if model supports tools/function calling
 * @param {string} model - Model name
 * @returns {boolean} - True if model can handle tools
 */
function modelSupportsTools(model) {
  // DeepSeek does NOT support tools (limitation)
  // Llama, Haiku, Sonnet, Opus all support tools
  const noToolsModels = ['deepseek'];
  return !noToolsModels.includes(model);
}

function enforceToolCompatibility(route, toolsRequested) {
  if (!route) return route;
  if (toolsRequested && route.model === 'deepseek') {
    return {
      ...route,
      model: 'llama',
      reason: 'tools_requested_deepseek_ineligible',
      downgradedFrom: 'deepseek',
      fallback: true,
      fallbackReason: 'DeepSeek does not support tools; forced to Llama in router',
      toolCapability: true,
      toolsRequested: true,
    };
  }
  return route;
}

/**
 * Route based on signals with capability gating
 * @param {object} params
 * @param {string} params.input - User input
 * @param {string} params.sessionId - For logging
 * @param {object} params.decision - Full decision context (to check for tools)
 * @returns {object} - {model: 'haiku'|'deepseek'|'llama'|'explain', reason: string, override: boolean, complexity_signals: string[], risk_signals: string[], toolsRequested: boolean, toolCapability: boolean}
 */
function routeModel({ input, sessionId = 'unknown', decision = null }) {
  const toolDetection = detectToolPaths(decision);
  const toolsRequested = toolDetection.toolsRequested;

  if (process.env.DIAG === 'true') {
    console.log('[Routing][DIAG] tool-shape', {
      sessionId,
      decisionKeys: decision ? Object.keys(decision) : [],
      toolsRequested,
      detectedPaths: toolDetection.paths,
      hits: toolDetection.hits,
    });
  }

  // Step 1: Check for manual override
  const override = parseManualOverride(input);
  if (override) {
    const overrideModel = override;
    const supportsTools = modelSupportsTools(overrideModel);
    
    // If tools requested but override model doesn't support them, deny
    if (toolsRequested && !supportsTools) {
      return enforceToolCompatibility({
        model: 'llama',
        reason: 'override_tool_incompatible',
        override: true,
        overrideCommand: override,
        fallback: true,
        fallbackReason: `@${override} does not support tools, falling back to Llama`,
        complexity_signals: [],
        risk_signals: [],
        toolsRequested,
        toolCapability: true
      }, toolsRequested);
    }

    return enforceToolCompatibility({
      model: overrideModel,
      reason: 'override',
      override: true,
      complexity_signals: [],
      risk_signals: [],
      overrideCommand: override,
      toolsRequested,
      toolCapability: supportsTools
    }, toolsRequested);
  }
  
  // Step 2: Check risk signals
  const riskSignals = detectRiskSignals(input);
  if (riskSignals && riskSignals.length > 0) {
    return enforceToolCompatibility({
      model: 'explain',
      reason: 'risk_signal',
      override: false,
      complexity_signals: [],
      risk_signals: riskSignals,
      message: `Risk detected (${riskSignals.join(', ')}). Request approval or use !explain for dry-run explanation.`,
      toolsRequested,
      toolCapability: true
    }, toolsRequested);
  }
  
  // Step 3: Check complexity signals
  // NOTE: DeepSeek doesn't support tools, so if tools needed, use Llama instead
  const complexitySignals = detectComplexitySignals(input);
  if (complexitySignals && complexitySignals.length > 0) {
    const chosenModel = (toolsRequested) ? 'llama' : 'deepseek';
    const fallback = toolsRequested ? true : false;
    
    return enforceToolCompatibility({
      model: chosenModel,
      reason: 'intense_thinking',
      override: false,
      complexity_signals: complexitySignals,
      risk_signals: [],
      escalateIfHaikuUnsure: true,
      fallback,
      fallbackReason: fallback ? 'DeepSeek does not support tools; using Llama instead' : null,
      toolsRequested,
      toolCapability: true
    }, toolsRequested);
  }
  
  // Step 4: Default to Haiku
  let route = {
    model: 'haiku',
    reason: 'default',
    override: false,
    complexity_signals: [],
    risk_signals: [],
    escalateIfHaikuUnsure: true,
    toolsRequested,
    toolCapability: true
  };

  // ========== BUDGET GATE: Enforce Anthropic availability ==========
  // If Anthropic is disabled (funds exhausted or explicit), downgrade paid models to local
  const anthropicEnabled = isAnthropicEnabled();
  const paidModels = ['haiku', 'sonnet', 'opus'];

  if (!anthropicEnabled && paidModels.includes(route.model)) {
    const originalModel = route.model;
    route.model = 'llama'; // Downgrade to local
    route.reason = 'anthropic_disabled';
    route.downgradedFrom = originalModel;
    route.escalateIfHaikuUnsure = false; // No escalation available
  }

  return enforceToolCompatibility(route, toolsRequested);
}

module.exports = {
  parseManualOverride,
  detectComplexitySignals,
  detectRiskSignals,
  hasToolsRequested,
  modelSupportsTools,
  routeModel
};
