const PROVIDER_TIMEOUT_MS = 60_000

/**
 * `fetch` that also gives up after PROVIDER_TIMEOUT_MS. The caller's signal
 * (cancel, session change) still aborts it as an AbortError; the timeout
 * aborts with a TimeoutError, so a hung provider ends in a visible error
 * instead of a spinner that never stops.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { signal: AbortSignal },
): Promise<Response> {
  const controller = new AbortController()
  const forward = () => controller.abort(init.signal.reason)
  const timer = setTimeout(() => controller.abort(new DOMException(
    `The AI provider did not answer within ${PROVIDER_TIMEOUT_MS / 1000} seconds.`,
    'TimeoutError',
  )), PROVIDER_TIMEOUT_MS)
  if (init.signal.aborted) forward()
  else init.signal.addEventListener('abort', forward, { once: true })
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
    init.signal.removeEventListener('abort', forward)
  }
}
