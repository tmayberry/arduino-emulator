export const MAX_SLICE_MS = 5;
export const MAX_INSTRUCTIONS_WITHOUT_ACTIVITY = 250_000;
export const MAX_TIMER_CHUNK_MS = 100;

export function realTimeWaitMs(
  virtualTimeMs: number,
  wallElapsedMs: number,
): number {
  return Math.max(0, virtualTimeMs - wallElapsedMs);
}

export function nextSchedulerDelay(waitMs: number): number {
  if (waitMs <= 0) return 0;
  return Math.min(waitMs, MAX_TIMER_CHUNK_MS);
}

export function isRunaway(instructionsWithoutActivity: number): boolean {
  return instructionsWithoutActivity >= MAX_INSTRUCTIONS_WITHOUT_ACTIVITY;
}
