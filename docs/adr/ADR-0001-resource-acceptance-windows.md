# ADR-0001: Judge sidebar resource budgets in a steady window at a named ready checkpoint

Status: accepted, supersedes the circular short-window comparison used before 2026-11-20.

## Context

The rendered-sidebar acceptance harness judged the product with a two-second stabilization and a
five-second observation, three pairs per dataset, on a shared four-vCPU runner. That window measured
the host's front-loaded native mount of the 250 rendered rows, which both arms pay.

Two campaigns on identical product bytes returned opposite verdicts. The runtime plugin hash
`4ba1671d7074735ebb604f41be2b8a3ef2064db5d51c4b19c6a1a52f96899b57` and all 31 source hashes were
equal; only the base commit differed. For 250 sessions the CPU delta was `+1.1992` points (failing)
on 2026-11-07 and `-5.6037` (passing) on 2026-11-12. Per-pair CPU spread reached two to ten times
the one-point budget, so a three-pair median is a coin flip. The 25-session memory median was
negative, `-68` and `-81` MiB, which is noise larger than the claimed cost.

A phase diagnostic on separate processes showed two controls differing by 100.34 MiB, of which
100.32 MiB was anonymous memory owned by the allocator rather than the product. Budgeting `RssAnon`
instead of `RSS` was therefore rejected: it carries the same noise.

A steady-state attribution run (ten pairs, eight evaluable, no injected events, thirty-second
settle, seventy-second observation) put sustained CPU at `+0.136` points with an IQR of `0.142`, a
pass with roughly seven times margin. It also confirmed front-loading: the mount segment cost 259
percent of a core for the control and 265 percent for the product, the settle decayed to 21.6 and
21.5, and the idle window fell to 1.8 in both arms.

## Decision

- Budget memory at the named `ready` checkpoint, sampled immediately after the TUI reports readiness
  and before the settle begins.
- Budget CPU over a seventy-second steady window that follows a thirty-second settle, at 250
  sessions, with ten pairs, two warm-up pairs discarded, leaving eight evaluable pairs. Arms run
  sequentially and alternate order per repetition.
- Apply one verdict rule everywhere: a metric fails only when its median exceeds the budget and also
  exceeds three times its own IQR. Fewer than five evaluable pairs, or an IQR above the budget, is
  inconclusive, and an inconclusive window neither blocks acceptance nor accepts the product.
- Keep the short cold, delayed and sustained windows as recorded coverage; they never gate on their
  own.
- Keep the budgets at 64 MiB and 1.0 point. Do not widen them after a failed run.
- Report the final resident memory and the growth across the long window as drift, and escalate a
  monotonic rise of object count, heap size or allocator commit instead of reading it as noise.

## What the old method measured versus the new one

The old method measured the joint process over five seconds starting two seconds after readiness,
took the median of three pairs and applied a single threshold. It measured the union of the host's
native mount transient and the product, with a sample too small to separate the two.

The new method samples memory at a named early checkpoint, where the phase diagnostic measured a
control-to-control spread of 40.98 MiB, below the 64 MiB budget, instead of 100.34 MiB at the
forty-five-second mark. That figure is derived from the status `VmRSS` of the two control phases at
the ready checkpoint and recorded in
[`../validation/memory-phase-attribution.json`](../validation/memory-phase-attribution.json); it did
not replicate in the steady campaigns, where the per-arm control spread at the same checkpoint was
117.25 and 129.65 MiB. The checkpoint therefore removes one component of drift without moving the
cross-process floor below the budget, which is why the campaigns came back inconclusive instead of
passing. The method measures CPU only after the transient has decayed, over eight or fourteen
evaluable pairs, and it separates signal from noise with an explicit band.

## Coverage lost

- The short window can no longer fail on its own. A regression confined to the first seconds is
  caught only when it also exceeds three times the IQR in the steady window.
- Long-window resident memory is reported but unbudgeted; only monotonic growth escalates.
- Automatic pull-request resource gating is now observational. The cold and delayed windows keep
  three pairs, below the five-pair minimum, so they can report a failure but can never pass, and
  their workflow steps say so instead of claiming a budget decision. The window that decides the
  budgets is the steady campaign, which is a manual dispatch and does not run on every pull request.
- The steady window measures 250 sessions only, so smaller lists rely on the recorded cold window
  for observation rather than acceptance.

## Alternatives rejected

- Keep the short gate and pursue a product fix: the dominant cost is the host's native mount, paid
  by both arms, and no product-side change removes it without changing the host.
- Budget `RssAnon` instead of `RSS`: rejected because the control-to-control spread is anonymous, so
  it moves the noise rather than removing it.

## Outcome of the first steady campaigns (2026-11-20)

The steady window ran twice on GitHub-hosted runners, first with the ten pre-registered pairs and
then with the single pre-registered extension to sixteen pairs. CPU passed in both, at a median
paired increase of +0.0286 and +0.0073 points against a budget of one point. Resident memory was
inconclusive in both: the median paired increase stayed at about 45 MiB, inside the 64 MiB budget,
while the interquartile range of the paired difference exceeded the budget and grew with the sample,
from 71.11 to 107.81 MiB.

That outcome exposes a limit of this decision rather than of the product. The CPU half of the steady
window works as intended, because the paired CPU difference is small and repeatable. The memory half
inherits a whole-process baseline near 700 MiB whose per-arm spread is about 130 MiB, which puts the
paired difference's spread above the budget. A robust interquartile range is insensitive to sample
size, so this is not a power problem that more pairs can fix: the instrument as specified cannot
resolve 64 MiB at this baseline, and it can only report that no failure was demonstrated.

The pre-registered extension is consumed and the criteria require stopping here. Choosing how the
memory budget should be read is a method decision that this record does not take. The measured
samples are preserved in
[`../validation/steady-acceptance.json`](../validation/steady-acceptance.json) and the narrative in
[`../validation/steady-acceptance-results.md`](../validation/steady-acceptance-results.md). This
record does not accept V1, and the pull request stays in draft.
