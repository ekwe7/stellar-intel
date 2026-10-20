import { computeRateComparison } from '@/lib/stellar/sep24';

/**
 * Floor tolerance applied to the expected net received amount when verifying
 * an anchor's returned amount_out estimate before signing payment (2%).
 */
export const MIN_RECEIVE_TOLERANCE = 0.02;

export const executionFailed = 'executionFailed';

export type MinReceiveReason = 'below_min' | 'no_estimate' | 'meets_min' | 'no_floor';

export interface MinReceiveCheckResult {
  ok: boolean;
  reason?: MinReceiveReason;
}

/**
 * Checks whether the anchor's own amount_out estimate satisfies the minimum
 * acceptable receive floor.
 *
 * - When minReceive is omitted: returns ok: true with reason 'no_floor'.
 * - When amountOut is missing or empty: returns ok: true with reason 'no_estimate' so the caller can continue with a note.
 * - When amountOut is below minReceive: returns ok: false with reason 'below_min'.
 * - When amountOut meets or exceeds minReceive: returns ok: true with reason 'meets_min'.
 */
export function checkMinReceive(
  amountOut?: string | number | null,
  minReceive?: string | number | null
): MinReceiveCheckResult {
  if (
    minReceive === undefined ||
    minReceive === null ||
    minReceive === '' ||
    isNaN(Number(String(minReceive).replace(/,/g, '').trim()))
  ) {
    return { ok: true, reason: 'no_floor' };
  }

  if (
    amountOut === undefined ||
    amountOut === null ||
    (typeof amountOut === 'string' && amountOut.trim() === '') ||
    isNaN(Number(String(amountOut).replace(/,/g, '').trim()))
  ) {
    return { ok: true, reason: 'no_estimate' };
  }

  const numAmountOut = Number(String(amountOut).replace(/,/g, '').trim());
  const numMinReceive = Number(String(minReceive).replace(/,/g, '').trim());

  if (numAmountOut < numMinReceive) {
    return { ok: false, reason: 'below_min' };
  }

  return { ok: true, reason: 'meets_min' };
}

/**
 * Emits funnel tracking events for monitoring conversion and failure reasons.
 */
export function trackFunnelEvent(event: string, properties?: Record<string, unknown>): void {
  if (
    typeof window !== 'undefined' &&
    typeof (
      window as unknown as {
        __trackFunnelEvent?: (evt: string, props?: Record<string, unknown>) => void;
      }
    ).__trackFunnelEvent === 'function'
  ) {
    (
      window as unknown as {
        __trackFunnelEvent: (evt: string, props?: Record<string, unknown>) => void;
      }
    ).__trackFunnelEvent(event, properties);
  }
}

export { computeRateComparison };
