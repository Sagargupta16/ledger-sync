import { useCallback, useEffect, useRef, useState } from 'react'

import {
  runMonteCarlo,
  type MonteCarloInputs,
  type MonteCarloRequest,
  type MonteCarloResponse,
  type MonteCarloResult,
} from '@/lib/finance/monteCarlo'

type RunStatus = 'idle' | 'running' | 'done' | 'error'

interface RunState {
  readonly status: RunStatus
  readonly result: MonteCarloResult | null
  /** The inputs behind `result`, so the tab can tell a current result from a stale one. */
  readonly resultInputs: MonteCarloInputs | null
  readonly error: string | null
}

const IDLE: RunState = { status: 'idle', result: null, resultInputs: null, error: null }

function createWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null
  try {
    // Vite bundles the worker from this literal URL, which must stay inline in `new Worker`.
    return new Worker(new URL('../../workers/monteCarlo.worker.ts', import.meta.url), { type: 'module' })
  } catch {
    return null
  }
}

/**
 * Runs the Monte Carlo in a Web Worker on demand. Only the latest request may
 * settle, so a quick second run never shows the first one's numbers. Without
 * worker support (an old browser, a test runner) or when the worker fails to
 * load, the same function runs on this thread after the spinner has painted.
 */
export function useMonteCarloRunner() {
  const workerRef = useRef<Worker | null>(null)
  const workerFailed = useRef(false)
  const latest = useRef(0)
  const [state, setState] = useState<RunState>(IDLE)

  useEffect(() => () => {
    workerRef.current?.terminate()
    workerRef.current = null
  }, [])

  const run = useCallback((inputs: MonteCarloInputs) => {
    latest.current += 1
    const id = latest.current
    setState((prev) => ({ ...prev, status: 'running', error: null }))
    const settle = (response: MonteCarloResponse) => {
      if (response.id !== latest.current) return
      setState((prev) => ('result' in response
        ? { status: 'done', result: response.result, resultInputs: inputs, error: null }
        : { ...prev, status: 'error', error: response.error }))
    }
    const runHere = () => window.setTimeout(() => {
      try {
        settle({ id, result: runMonteCarlo(inputs) })
      } catch (error) {
        settle({ id, error: error instanceof Error ? error.message : 'The simulation failed.' })
      }
    }, 0)

    if (!workerFailed.current) workerRef.current ??= createWorker()
    const worker = workerRef.current
    if (!worker) {
      runHere()
      return
    }
    worker.onmessage = (event: MessageEvent<MonteCarloResponse>) => settle(event.data)
    worker.onerror = (event) => {
      event.preventDefault()
      worker.terminate()
      workerRef.current = null
      workerFailed.current = true
      runHere()
    }
    const request: MonteCarloRequest = { id, inputs }
    worker.postMessage(request)
  }, [])

  return { ...state, run }
}
