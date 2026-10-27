/**
 * Runs the FIRE Monte Carlo off the main thread, so thousands of simulated
 * retirements never block a tap or a scroll. One request in, one response out;
 * the caller matches responses by `id` and ignores stale ones.
 *
 * Typed through a narrow scope instead of the WebWorker lib, which would clash
 * with the DOM lib the rest of the app compiles against.
 */

import { runMonteCarlo, type MonteCarloRequest, type MonteCarloResponse } from '@/lib/finance/monteCarlo'

interface WorkerScope {
  onmessage: ((event: MessageEvent<MonteCarloRequest>) => void) | null
  postMessage: (message: MonteCarloResponse) => void
}

const scope = self as unknown as WorkerScope

scope.onmessage = (event) => {
  const { id, inputs } = event.data
  try {
    scope.postMessage({ id, result: runMonteCarlo(inputs) })
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : 'The simulation failed.' })
  }
}
