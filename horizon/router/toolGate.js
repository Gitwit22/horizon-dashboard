/**
 * toolGate.js
 * 
 * Hard gate: prevents tools from being attached to models that don't support them
 * DeepSeek does NOT support tools → gate/strip before execution
 */

/**
 * Check if decision object contains tool schemas
 * @param {Object} decision - The decision/request object
 * @returns {boolean} - True if tools are present
 */
function hasTools(decision) {
  return getToolDetectionDiagnostics(decision).toolsRequested;
}

function getToolDetectionDiagnostics(decision) {
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
    toolsRequested: Object.values(hits).some(Boolean),
    hits,
    detectedPaths: Object.keys(hits).filter((key) => hits[key]),
    decisionKeys: decision ? Object.keys(decision) : [],
  };
}

/**
 * Check if model supports tools/function calling
 * @param {string} model - Model name (haiku, sonnet, opus, deepseek, llama, etc.)
 * @returns {boolean} - True if model can handle tools
 */
function modelSupportsTools(model) {
  if (!model || typeof model !== 'string') return false;

  // Models that DO NOT support tools
  const noToolsModels = ['deepseek'];
  
  // Models that DO support tools
  const toolsSupportedModels = ['haiku', 'sonnet', 'opus', 'llama', 'gpt', 'claude'];

  if (noToolsModels.includes(model.toLowerCase())) {
    return false;
  }

  // Default: assume most models support tools unless explicitly excluded
  return true;
}

/**
 * Strip tools from decision object (return new object without tools)
 * @param {Object} decision - Original decision
 * @returns {Object} - New decision object with tools removed
 */
function stripTools(decision) {
  if (!decision) return decision;

  // Deep clone to avoid mutations
  const cleaned = JSON.parse(JSON.stringify(decision));

  // Remove tools from all possible locations
  if (Array.isArray(cleaned.tools)) {
    delete cleaned.tools;
  }
  if (cleaned.tool_choice !== undefined) {
    delete cleaned.tool_choice;
  }
  if (cleaned.functions !== undefined) {
    delete cleaned.functions;
  }
  if (cleaned.function_call !== undefined) {
    delete cleaned.function_call;
  }
  if (Array.isArray(cleaned.toolSchemas)) {
    delete cleaned.toolSchemas;
  }
  if (cleaned.llm) {
    if (Array.isArray(cleaned.llm.tools)) {
      delete cleaned.llm.tools;
    }
    if (cleaned.llm.tool_choice !== undefined) {
      delete cleaned.llm.tool_choice;
    }
    if (cleaned.llm.functions !== undefined) {
      delete cleaned.llm.functions;
    }
    if (cleaned.llm.function_call !== undefined) {
      delete cleaned.llm.function_call;
    }
    if (Array.isArray(cleaned.llm.toolSchemas)) {
      delete cleaned.llm.toolSchemas;
    }
  }
  if (cleaned.meta) {
    if (Array.isArray(cleaned.meta.tools)) {
      delete cleaned.meta.tools;
    }
    if (cleaned.meta.tool_choice !== undefined) {
      delete cleaned.meta.tool_choice;
    }
    if (cleaned.meta.functions !== undefined) {
      delete cleaned.meta.functions;
    }
    if (cleaned.meta.function_call !== undefined) {
      delete cleaned.meta.function_call;
    }
  }
  if (cleaned.request) {
    if (Array.isArray(cleaned.request.tools)) {
      delete cleaned.request.tools;
    }
    if (cleaned.request.tool_choice !== undefined) {
      delete cleaned.request.tool_choice;
    }
    if (cleaned.request.functions !== undefined) {
      delete cleaned.request.functions;
    }
    if (cleaned.request.function_call !== undefined) {
      delete cleaned.request.function_call;
    }
    if (Array.isArray(cleaned.request.toolSchemas)) {
      delete cleaned.request.toolSchemas;
    }
  }

  return cleaned;
}

/**
 * Gate: ensure tools never reach incompatible models
 * 
 * @param {Object} decision - Request decision
 * @param {string} model - Chosen model
 * @returns {Object} - { allowed: boolean, model: string, toolsRequested: boolean, gated: boolean, reason?: string }
 */
function gateTools(decision, model) {
  const toolsRequested = hasTools(decision);
  const supported = modelSupportsTools(model);

  // Case 1: No tools requested - always allowed
  if (!toolsRequested) {
    return {
      allowed: true,
      model,
      toolsRequested: false,
      gated: false
    };
  }

  // Case 2: Tools requested, model supports - allowed
  if (toolsRequested && supported) {
    return {
      allowed: true,
      model,
      toolsRequested: true,
      gated: false
    };
  }

  // Case 3: Tools requested, model does NOT support - BLOCK
  return {
    allowed: false,
    model,
    toolsRequested: true,
    gated: true,
    reason: `${model} does not support tools. Strip tools or use a compatible model (haiku, sonnet, opus, llama).`
  };
}

module.exports = {
  hasTools,
  getToolDetectionDiagnostics,
  modelSupportsTools,
  stripTools,
  gateTools
};
