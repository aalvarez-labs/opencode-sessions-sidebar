import {
  decideVerdict,
  interquartileRange,
  median,
  type VerdictCriteria,
  type VerdictResult,
} from "./memory-deltas";

/** One paired difference for a single repetition: product minus control. */
export interface ResourcePairSample {
  readonly repetition: number;
  /** Resident memory at the named `ready` checkpoint. This is the budgeted metric. */
  readonly rssReadyDeltaMiB: number;
  /** Resident memory at the end of the observation window, reported as drift only. */
  readonly rssEndDeltaMiB: number;
  /** CPU points consumed across the observation window. */
  readonly cpuPoints: number;
}

export interface ResourceWindowAssessment {
  readonly verdict: VerdictResult["verdict"];
  readonly evaluablePairs: number;
  readonly totalPairs: number;
  readonly warmupDiscarded: readonly number[];
  readonly droppedPairs: readonly number[];
  readonly rssReady: { readonly median: number; readonly iqr: number };
  readonly cpu: { readonly median: number; readonly iqr: number };
  readonly rssEndDrift: { readonly median: number; readonly iqr: number };
  readonly assessment: VerdictResult;
}

/**
 * Assess one acceptance window from its paired differences. Memory is judged at the `ready`
 * checkpoint and CPU over the observation window; the final resident delta is reported as drift.
 * Warm-up pairs are discarded first, then any pair missing a finite metric is dropped and named,
 * so a campaign cannot quietly shrink its own sample. The PASS/FAIL/INCONCLUSIVE rule itself is
 * delegated to `decideVerdict` and is never re-implemented here.
 */
export function assessResourceWindow(
  pairs: readonly ResourcePairSample[],
  warmupPairsDiscarded: number,
  criteria: VerdictCriteria,
): ResourceWindowAssessment {
  const ordered = [...pairs].sort((a, b) => a.repetition - b.repetition);
  const warmupDiscarded: number[] = [];
  const droppedPairs: number[] = [];
  const usable: ResourcePairSample[] = [];
  ordered.forEach((pair, index) => {
    if (index < warmupPairsDiscarded) {
      warmupDiscarded.push(pair.repetition);
      return;
    }
    const complete =
      Number.isFinite(pair.rssReadyDeltaMiB) &&
      Number.isFinite(pair.rssEndDeltaMiB) &&
      Number.isFinite(pair.cpuPoints);
    if (complete) usable.push(pair);
    else droppedPairs.push(pair.repetition);
  });
  const rssReadyValues = usable.map((pair) => pair.rssReadyDeltaMiB);
  const cpuValues = usable.map((pair) => pair.cpuPoints);
  const driftValues = usable.map((pair) => pair.rssEndDeltaMiB);
  const assessment = decideVerdict({ rss: rssReadyValues, cpu: cpuValues }, criteria);
  return {
    verdict: assessment.verdict,
    evaluablePairs: assessment.evaluablePairs,
    totalPairs: ordered.length,
    warmupDiscarded,
    droppedPairs,
    rssReady: { median: median(rssReadyValues), iqr: interquartileRange(rssReadyValues) },
    cpu: { median: median(cpuValues), iqr: interquartileRange(cpuValues) },
    rssEndDrift: { median: median(driftValues), iqr: interquartileRange(driftValues) },
    assessment,
  };
}
