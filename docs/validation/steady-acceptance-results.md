# Steady acceptance campaigns

Two campaigns of the steady window described in
[`resource-acceptance-criteria.md`](./resource-acceptance-criteria.md) ran on GitHub-hosted runners
against the product on `perf/idle-render-20261107`. The first campaign used the ten paired
repetitions the criteria pre-register; the second consumed the single pre-registered extension to
sixteen pairs.

This record does not accept V1. It reports what the steady window measured, what it could not
measure, and which method decision is still open.

## Method

Each paired repetition runs the host twice on an isolated 250-session fixture, once with the product
and once without it, alternating the order. Every arm samples resident memory at the `ready`
checkpoint as soon as the interface signals it has rendered, waits 30 s, then observes for 70 s, and
the sampler reads whole-process CPU from `/proc/<pid>/stat` before and after that window. The paired
difference is the product arm minus the control arm; medians and interquartile ranges are computed
over the paired differences after discarding the first two repetitions as warmup.

The verdict follows the pre-registered rule: a metric fails only when its median exceeds the budget
and that median also exceeds three interquartile ranges; a metric is inconclusive when fewer than
five pairs remain evaluable or its interquartile range exceeds the budget; otherwise it passes.
Inconclusive neither blocks nor accepts, so a campaign can exit the measurement step successfully
and still turn its workflow gate red, which is what both campaigns did.

## Campaigns

| Campaign  | Run                                                                                                | Source commit | Pairs | Evaluable | Source revision                        |
| --------- | -------------------------------------------------------------------------------------------------- | ------------- | ----: | --------: | -------------------------------------- |
| Initial   | [44696780544](https://github.com/aalvarez-labs/opencode-sessions-sidebar/actions/runs/44696780544) | `923acc5`     |    10 |         8 | watchdog sized for the whole campaign  |
| Extension | [44814989636](https://github.com/aalvarez-labs/opencode-sessions-sidebar/actions/runs/44814989636) | `c8cda87`     |    16 |        14 | pair count exposed as a dispatch input |

### CPU over the steady window

| Campaign  | Median paired points | Interquartile range | Budget | Assessment |
| --------- | -------------------: | ------------------: | -----: | ---------- |
| Initial   |              +0.0286 |              0.2215 |    1.0 | PASS       |
| Extension |              +0.0073 |              0.1571 |    1.0 | PASS       |

The steady window is the authoritative one for CPU, and it passes in both campaigns with a wide
margin: the median paired increase is 0.0286 points in the first campaign and 0.0073 in the second,
against a budget of one point, and the interquartile range is between four and a half and six and a
half times smaller than the budget. This replaces
the earlier claim that the idle cost was around 2.7 points per core. That number came from a
campaign that injected twenty synthetic events and then measured the settle window those events
created; with the burst removed the sustained cost is indistinguishable from the control.

### Resident memory at the ready checkpoint

| Campaign  | Median paired MiB | Interquartile range | Budget | Assessment   |
| --------- | ----------------: | ------------------: | -----: | ------------ |
| Initial   |          +45.4961 |             71.1084 |     64 | INCONCLUSIVE |
| Extension |          +44.6914 |            107.8076 |     64 | INCONCLUSIVE |

Paired differences of the extension campaign, in MiB, repetitions one to sixteen:
`+61, +88, +42, −57, −80, −77, +70, +47, +109, +155, +41, −35, +89, +170, +87, +26`.

The median is stable across both campaigns at roughly 45 MiB, which is inside the 64 MiB budget. The
interquartile range is not: it exceeds the budget, and it grew when the sample grew. That growth is
the diagnostic, not a nuisance. Absolute resident memory at the ready checkpoint spans 706 to 848
MiB with the product and 678 to 808 MiB without it, so a single arm carries a spread of roughly 130
MiB before any product difference is considered. The paired difference of two such samples spans
about 250 MiB, which puts its interquartile range over 100 MiB.

A robust interquartile range estimates the spread of the distribution and is insensitive to sample
size, so neither sixteen pairs nor a larger campaign narrows the band under the pre-registered rule.
The instrument, as specified, cannot resolve a 64 MiB difference at a baseline near 700 MiB. The
ready checkpoint was chosen because the phase diagnostic measured a 40.98 MiB control-to-control
spread there against 100.34 MiB at the forty-five-second mark, but those campaigns did not
reproduce the quieter checkpoint, so the choice reduces one component of drift without moving the
floor below the budget. The
pre-registered extension is now consumed, and the criteria say to stop and hand the method decision
to the user rather than to keep drawing campaigns.

### Boot to ready

Across the evaluable extension pairs the product arm reached the ready checkpoint in 2865 to 3274 ms
and the control arm in 2741 to 3094 ms, so the product adds roughly 90 to 180 ms to a start-up that
already spends about three seconds in the host. The activation budget was measured separately by the
headless adapter benchmark, where activation p95 was 185 to 203 ms against a 500 ms budget, and this
window does not contradict it.

## What this record establishes

- The product does not add a sustained idle CPU cost that the acceptance budget can detect: two
  independent campaigns agree, with medians two orders of magnitude below the budget.
- No steady campaign produced a failure. Both campaigns are inconclusive on resident memory because
  the noise band exceeds the budget, not because the median does.
- The median paired resident-memory increase attributable to the product at the ready checkpoint is
  consistently around 45 MiB, inside the budget, and the earlier within-process diagnostics measured
  import and activation deltas of about 1.3 MiB and about 0 MiB respectively.

## What this record does not establish

- It does not prove an upper bound on resident memory. An inconclusive measurement cannot exclude a
  regression larger than its own noise band, and the noise band is larger than the budget.
- It does not cover leak-shaped behaviour. The steady window observes 70 s of idle with no activity;
  monotonic growth under sustained event traffic is outside it.
- It does not replace a memory gate that runs automatically. The previous short and delayed windows
  still exist and still measure what they measured, but with three pairs each they can only report
  a failure and never pass, and their workflow steps are named as observations; this record only shows that the short window's CPU verdict is
  dominated by the host's start-up burst, since the same product bytes produced +1.1992 and −5.6037
  points in two campaigns.

## Open decision

The resident-memory gate needs one of three treatments, and none of them can be chosen silently:

1. Move the memory budget onto a within-process measurement taken inside one host, where the
   activation and import deltas for the same product were about 0 and 1.3 MiB. This removes
   cross-process variance entirely, and loses the ability to see native or OS-level growth that the
   in-process counters do not attribute.
2. Keep the cross-process instrument but redefine its threshold in terms of its own noise, so that a
   median inside the budget is reported as not a demonstrated regression. This keeps whole-process
   coverage, and accepts that a real regression smaller than the noise band stays undetected.
3. Keep the instrument and the threshold unchanged, and treat the memory gate as unsatisfiable at
   this baseline until a lower-noise fixture exists. This preserves the strictest reading of the
   budget, and leaves V1 blocked on a measurement the fixture cannot produce.

## Reproduction

```bash
gh api -X POST \
  "repos/aalvarez-labs/opencode-sessions-sidebar/actions/workflows/isolated-steady-acceptance.yml/dispatches" \
  -f ref=perf/idle-render-20261107 -f 'inputs[pairs]=16'
gh run download <run-id> -n steady-acceptance
```

The machine-readable record of both campaigns, including every paired sample, is
[`steady-acceptance.json`](./steady-acceptance.json).
