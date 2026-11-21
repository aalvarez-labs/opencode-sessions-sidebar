import { describe, expect, test } from "bun:test";
import {
  assessResourceWindow,
  sustainedReferenceObservation,
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

describe("sustained reference observation", () => {
  const budgets = { rssMiB: 64, cpuPoints: 1 };
  // The recorded integration pair had final RSS below budget and ready RSS above it.
  const row = {
    window: { name: "sustained" },
    sessions: 250,
    evaluablePairs: 1,
    budgetedMemory: "rssReady",
    medianRssDeltaMiB: 24.8515625,
    medianBudgetedRssDeltaMiB: 69.9609375,
    medianRssReadyDeltaMiB: 69.9609375,
    cpuMedianPoints: 0.8803904732112748,
  };

  test("uses named ready RSS and never promotes a single pair to acceptance", () => {
    expect(sustainedReferenceObservation([row], budgets)).toEqual({
      acceptanceEvaluated: false,
      referenceBudgetsMet: false,
      referenceObservation: {
        budgetedMemory: "rssReady",
        rssMiB: 69.9609375,
        cpuPoints: row.cpuMedianPoints,
      },
    });
    const passing = {
      ...row,
      medianBudgetedRssDeltaMiB: 64,
      medianRssReadyDeltaMiB: 64,
      medianRssDeltaMiB: 90,
      cpuMedianPoints: 1,
    };
    expect(sustainedReferenceObservation([passing], budgets)).toMatchObject({
      acceptanceEvaluated: false,
      referenceBudgetsMet: true,
    });
    expect(
      sustainedReferenceObservation([{ ...passing, cpuMedianPoints: 1.01 }], budgets),
    ).toMatchObject({
      acceptanceEvaluated: false,
      referenceBudgetsMet: false,
    });
  });

  test("rejects missing, malformed or differently budgeted metrics", () => {
    for (const patch of [
      { budgetedMemory: "rssEnd" },
      { medianBudgetedRssDeltaMiB: undefined },
      { medianBudgetedRssDeltaMiB: 24.8515625 },
      { medianBudgetedRssDeltaMiB: null },
      { cpuMedianPoints: Number.NaN },
      { cpuMedianPoints: Infinity },
      { cpuMedianPoints: "0" },
      { evaluablePairs: 0 },
      { window: { name: "delayed" } },
    ])
      expect(() => sustainedReferenceObservation([{ ...row, ...patch }], budgets)).toThrow();
    expect(() => sustainedReferenceObservation([], budgets)).toThrow();
    expect(() => sustainedReferenceObservation([row, row], budgets)).toThrow();
  });
});
