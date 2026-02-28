// API service for connecting to Horizon Agent on Computer B (10.0.0.194)

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || 'http://10.0.0.194:3001'

export interface Heartbeat {
  lastEvent: Date
  lastSuccess: Date
  queueSize: number
  activeRuns: number
  avgResponse: number
  runsToday: number
  errorRate: number
  stuckThreshold: number
}

export interface Run {
  id: string
  status: 'Success' | 'Error' | 'Running' | 'Queued'
  started: string
  duration?: string
  agent: string
  user: string
  tokens: number
  cost: number
}

export interface ProjectStatus {
  name: string
  status: 'active' | 'waiting' | 'warning'
  metrics: Array<{ label: string; value: string }>
}

export interface SkillExecution {
  name: string
  runs: number
  completed: number
  percentage: number
}

export interface CostBreakdown {
  project: string
  cost: number
  breakdown: Array<{ label: string; amount: number }>
}

export interface UploadedDocument {
  id: string
  name: string
  size: number
  type: string
  uploadedAt: string
  status: 'uploaded' | 'processing' | 'failed'
}

// Fetch heartbeat data
export async function fetchHeartbeat(): Promise<Heartbeat> {
  try {
    const response = await fetch(`${GATEWAY_URL}/api/heartbeat`)
    if (!response.ok) throw new Error('Failed to fetch heartbeat')
    return await response.json()
  } catch (error) {
    console.error('Heartbeat fetch error:', error)
    // Return mock data as fallback
    return {
      lastEvent: new Date(),
      lastSuccess: new Date(Date.now() - 11 * 60 * 1000),
      queueSize: 3,
      activeRuns: 1,
      avgResponse: 4.3,
      runsToday: 47,
      errorRate: 0.042,
      stuckThreshold: 120
    }
  }
}

// Fetch runs
export async function fetchRuns(): Promise<Run[]> {
  try {
    const response = await fetch(`${GATEWAY_URL}/api/runs`)
    if (!response.ok) throw new Error('Failed to fetch runs')
    const data = await response.json()
    return data.runs || []
  } catch (error) {
    console.error('Runs fetch error:', error)
    return []
  }
}

// Fetch project statuses
export async function fetchProjectStatus(): Promise<ProjectStatus[]> {
  try {
    const response = await fetch(`${GATEWAY_URL}/api/projects`)
    if (!response.ok) throw new Error('Failed to fetch projects')
    return await response.json()
  } catch (error) {
    console.error('Projects fetch error:', error)
    return []
  }
}

// Fetch skill execution stats
export async function fetchSkillStats(): Promise<SkillExecution[]> {
  try {
    const response = await fetch(`${GATEWAY_URL}/api/skills`)
    if (!response.ok) throw new Error('Failed to fetch skills')
    return await response.json()
  } catch (error) {
    console.error('Skills fetch error:', error)
    return []
  }
}

// Fetch cost breakdown
export async function fetchCostBreakdown(): Promise<CostBreakdown[]> {
  try {
    const response = await fetch(`${GATEWAY_URL}/api/costs`)
    if (!response.ok) throw new Error('Failed to fetch costs')
    return await response.json()
  } catch (error) {
    console.error('Costs fetch error:', error)
    return []
  }
}

export async function uploadDocument(file: File): Promise<UploadedDocument> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${GATEWAY_URL}/api/documents/upload`, {
    method: 'POST',
    body: formData
  })

  if (!response.ok) {
    throw new Error('Failed to upload document')
  }

  const data = await response.json()

  return {
    id: data.id || `doc_${Date.now()}`,
    name: data.name || file.name,
    size: data.size || file.size,
    type: data.type || file.type || 'application/octet-stream',
    uploadedAt: data.uploadedAt || new Date().toISOString(),
    status: data.status || 'uploaded'
  }
}

// WebSocket connection for real-time updates
export function connectWebSocket(
  onHeartbeat: (data: Heartbeat) => void,
  onRun: (data: Run) => void
) {
  const wsUrl = GATEWAY_URL.replace('http', 'ws')
  const ws = new WebSocket(`${wsUrl}/ws`)

  ws.onopen = () => console.log('WebSocket connected')
  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data)
      if (message.type === 'heartbeat') onHeartbeat(message.data)
      if (message.type === 'run') onRun(message.data)
    } catch (error) {
      console.error('WebSocket message error:', error)
    }
  }
  ws.onerror = (error) => console.error('WebSocket error:', error)

  return ws
}
