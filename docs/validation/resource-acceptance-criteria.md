# Rendered sidebar resource acceptance criteria

This document pre-registers how the rendered sidebar's resident memory and CPU are judged against a
control arm that runs the same host without the product. It replaces the earlier circular
short-window comparison that this repository used before 2026-11-12.

## Windows and order

- `cold`: settle 2 s, observe 5 s, 3 pairs at 25 and 250 sessions. Reported, never gating.
- `delayed`: settle 20 s, observe 10 s, 3 pairs at 250 sessions. Reported, never gating.
- `sustained`: settle 20 s, observe 210 s, 250 sessions. Reported, never gating.
- `steady`: settle 30 s, observe 70 s, 250 sessions, 10 pairs with 2 warmup pairs discarded, leaving
  8 evaluable pairs. This is the authoritative window.

Each window runs both arms in the same host build. The order of the enabled and baseline arms
alternates per repetition, and every arm is sequential, never concurrent.

## Sample and statistic

- Memory is budgeted at the named `ready` checkpoint: the first resident sample taken right after
  the TUI reports readiness and before the settle begins.
- CPU is budgeted over the observation window that follows the settle.
- The statistic is the median of paired differences, product minus control, with the interquartile
  range as its spread.
- The target environment is ubuntu-24.04, 4 vCPU, Bun 1.3.14 and OpenCode 1.18.30.

## Verdict

- The budget stays at 64 MiB RSS and 1.0 point of CPU. It is not widened after a failed run.
- A metric fails only when its median exceeds the budget and also exceeds 3×IQR of the paired
  differences. A difference smaller than the spread is not a finding.
- The window is inconclusive when fewer than 5 evaluable pairs remain or when the IQR exceeds the
  budget. An inconclusive window neither blocks acceptance nor accepts the product.
- The window passes otherwise, and the overall verdict passes only when both metrics pass.
- Final RSS and the resident growth across the long window are reported as drift, not gated. A
  monotonic rise of object count, heap size or allocator commit across the idle window is escalated
  for investigation instead of being read as noise.

## Interpretation rule

- The short `cold` window cannot fail the gate on its own. Its per-pair range has been observed at
  2–10× the budget, so a 3-pair median is not an attribution of product cost.
- The `steady` window is authoritative because the first seconds measure the host's front-loaded
  native mount of the 250 rendered rows, which both arms pay.

## Escalation

- If the steady window is inconclusive, the campaign may be extended once to 16 pairs. If it is
  still inconclusive, or it fails with a signal above 3×IQR, the work stops and escalates to the
  user with the data.

## Coverage lost

- The short gate no longer blocks on its own; a first-seconds regression is only caught when it also
  shows up above 3×IQR in the steady window.
- Long-window resident memory is unbudgeted; only monotonic growth escalates.
- The steady window measures 250 sessions only; smaller lists are reported elsewhere.
