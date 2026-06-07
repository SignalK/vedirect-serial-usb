/**
 * Timer capture for transport reconnect tests.
 *
 * The transports schedule reconnects with `setTimeout(..., 10000)`. Letting
 * that arm for real would leak a live timer (and an endless reconnect loop)
 * into the test process, so `withCapturedTimers` swaps `global.setTimeout` for
 * a recorder: scheduled callbacks are collected for inspection instead of
 * armed. A real-timer safety net rejects if the body never settles, so a
 * mismatched expectation fails fast rather than hanging the whole run with the
 * override still installed.
 */

export interface CapturedTimer {
  cb: () => void
  delay: number
}

export async function withCapturedTimers<T>(
  fn: (timers: CapturedTimer[]) => Promise<T>,
  safetyMs = 1500
): Promise<T> {
  const timers: CapturedTimer[] = []
  const realSetTimeout = global.setTimeout
  ;(global as unknown as { setTimeout: unknown }).setTimeout = (
    cb: () => void,
    delay?: number
  ): number => {
    timers.push({ cb, delay: delay ?? 0 })
    return 0
  }

  let guard: ReturnType<typeof realSetTimeout> | undefined
  const safety = new Promise<never>((_resolve, reject) => {
    guard = realSetTimeout(
      () => reject(new Error('withCapturedTimers: body did not settle')),
      safetyMs
    )
  })

  try {
    return await Promise.race([fn(timers), safety])
  } finally {
    clearTimeout(guard)
    ;(global as unknown as { setTimeout: unknown }).setTimeout = realSetTimeout
  }
}
