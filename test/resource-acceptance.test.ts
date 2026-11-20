import { describe, expect, test } from "bun:test";
import {
  assessResourceWindow,
  type ResourcePairSample,
} from "../scripts/lib/resource-acceptance";

const criteria = {
  budgetRssMiB: 64,
  budgetCpuPoints: 1,
  signalIqrMultiple: 3,
  minEvaluablePairs: 5,
};

function uniformPairs(count: number, rss: number, cpu: number): ResourcePairSample[] {
  return Array.from({ length: count }, (_, index) => ({
    repetition: index + 1,
    rssReadyDeltaMiB: rss,
    rssEndDeltaMiB: rss,
    cpuPoints: cpu,
  }));
}

describe("assessResourceWindow", () => {
  test("discards the declared warm-up pairs and leaves eight evaluable", () => {
    const result = assessResourceWindow(uniformPairs(10, 5, 0.2), 2, criteria);
    expect(result.totalPairs).toBe(10);
    expect(result.evaluablePairs).toBe(8);
    expect(result.warmupDiscarded).toEqual([1, 2]);
    expect(result.droppedPairs).toEqual([]);
  });

  test("passes when both metrics sit inside the budget", () => {
    const result = assessResourceWindow(uniformPairs(10, 5, 0.2), 2, criteria);
    expect(result.verdict).toBe("PASS");
  });

  test("fails CPU when the median clears the budget above three times the IQR", () => {
    const jitter = [1.95, 1.95, 1.95, 2.0, 2.0, 2.05, 2.05, 2.05];
    const samples = uniformPairs(8, 1, 0).map((pair, index) => ({
      ...pair,
      cpuPoints: jitter[index]!,
    }));
    const result = assessResourceWindow(samples, 0, criteria);
    expect(result.cpu.median).toBe(2);
    expect(result.cpu.iqr).toBeCloseTo(0.1, 6);
    expect(result.verdict).toBe("FAIL_CPU");
  });

  test("is inconclusive when memory noise exceeds the budget", () => {
    const noisy = [0, 0, 0, 0, 0, 50, 150, 300];
    const samples = noisy.map((value, index) => ({
      repetition: index + 1,
      rssReadyDeltaMiB: value,
      rssEndDeltaMiB: value,
      cpuPoints: 0.1,
    }));
    const result = assessResourceWindow(samples, 0, criteria);
    expect(result.rssReady.iqr).toBeGreaterThan(64);
    expect(result.verdict).toBe("INCONCLUSIVE");
  });

  test("is inconclusive below the minimum evaluable pairs", () => {
    const result = assessResourceWindow(uniformPairs(4, 5, 0.2), 0, criteria);
    expect(result.evaluablePairs).toBe(4);
    expect(result.verdict).toBe("INCONCLUSIVE");
  });

  test("names a pair that is missing a finite metric instead of silently shrinking", () => {
    const samples = uniformPairs(6, 5, 0.2);
    samples[2] = { ...samples[2]!, cpuPoints: Number.NaN };
    const result = assessResourceWindow(samples, 0, criteria);
    expect(result.droppedPairs).toEqual([3]);
    expect(result.evaluablePairs).toBe(5);
  });
});
