import { useState, useEffect } from 'react'
import {
  fetchHeartbeat,
  fetchRuns,
  fetchProjectStatus,
  fetchSkillStats,
  fetchCostBreakdown,
  connectWebSocket,
  type Heartbeat,
  type Run,
  type ProjectStatus,
  type SkillExecution,
  type CostBreakdown
} from '@/api/horizonApi'

export function useHeartbeat() {
  const [heartbeat, setHeartbeat] = useState<Heartbeat | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const data = await fetchHeartbeat()
        setHeartbeat(data)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load heartbeat')
      } finally {
        setLoading(false)
      }
    }

    load()
    const interval = setInterval(load, 5000) // Refresh every 5 seconds
    return () => clearInterval(interval)
  }, [])

  return { heartbeat, loading, error }
}

export function useRuns() {
  const [runs, setRuns] = useState<Run[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const data = await fetchRuns()
        setRuns(data)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load runs')
      } finally {
        setLoading(false)
      }
    }

    load()
    const interval = setInterval(load, 10000) // Refresh every 10 seconds
    return () => clearInterval(interval)
  }, [])

  return { runs, loading, error }
}

export function useProjectStatus() {
  const [projects, setProjects] = useState<ProjectStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const data = await fetchProjectStatus()
        setProjects(data)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load projects')
      } finally {
        setLoading(false)
      }
    }

    load()
    const interval = setInterval(load, 30000) // Refresh every 30 seconds
    return () => clearInterval(interval)
  }, [])

  return { projects, loading, error }
}

export function useSkillStats() {
  const [skills, setSkills] = useState<SkillExecution[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const data = await fetchSkillStats()
        setSkills(data)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load skills')
      } finally {
        setLoading(false)
      }
    }

    load()
    const interval = setInterval(load, 30000) // Refresh every 30 seconds
    return () => clearInterval(interval)
  }, [])

  return { skills, loading, error }
}

export function useCostBreakdown() {
  const [costs, setCosts] = useState<CostBreakdown[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const data = await fetchCostBreakdown()
        setCosts(data)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load costs')
      } finally {
        setLoading(false)
      }
    }

    load()
    const interval = setInterval(load, 60000) // Refresh every 60 seconds
    return () => clearInterval(interval)
  }, [])

  return { costs, loading, error }
}
