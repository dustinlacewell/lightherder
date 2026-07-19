# The stable-fractal regime

Settled by a three-way dialectic (dynamicist / constructor / adversary, 2026-07-17)
over the question: how do you composite a STABLE fractal — one that survives,
follows the knobs without accumulating, and can feed downstream stages?

## The law

**Seed at the bottom, contraction everywhere, persistence nowhere.**

```
mon = KEY( … KEY( KEY( warpA(mon), warpB(mon) ), warpC(mon) ) …, SEED )
```

- **Stability comes from a permanent external SEED** (a source node holding a
  small bright shape, keyed in unconditionally every lap) — never from
  self-persistence. A loop whose only content is transient (taps/sparks) dies;
  a loop that keys its own frame back in (an identity arm) is stable but
  never forgets — knob changes smear forever. This is a *condensation IFS*:
  attractor = ∪ over all map-words w of w(SEED).
- **Every arm contractive** (zoom < 1). Guard: Σ zoom² < 0.9 across arms —
  above ~1.0 a fat region can cover itself and survive seedless (a ghost).
  Violations are self-healing on return (~1.3 s); the guard is advisory.
  At zoom = 1 exactly, orphans spin forever.
- **Nothing persists on its own**: no identity arm, persist ≈ 0, AGC 0,
  grain 0, hue 0 in-loop (hue rotates per lap → rainbow oscillator).
  Every pixel exists only by re-derivation from the seed *this lap* — so
  knob changes propagate stem-to-tip in ~depth laps (≤1 s) and orphaned
  structure dies automatically. R1+R2+R3 are structural, not tuned.

## Level restoration (the merged regime)

Per-lap losses (bilinear resampling of thin features) must be paid back
WITHOUT a hard threshold (blur-then-hard-threshold iterated = mean-curvature
flow + dead zones — erodes tips):

- **Boundary = the key smoothstep** (slope ~10.7; the sharpest nonlinearity
  in the loop). Restoration = **per-arm camera exposure** (+ small profile
  contrast); ceiling = the screenTail tanh above 0.8 (free anti-bloom).
- **Front bias lives per-arm at camera exposure.** Dilation does not creep:
  boundary offset obeys δ' = s·δ + d → converges to a coat δ* = d/(1−s),
  two-sided stable (contraction itself is the restoring force).
- **KEY(A,B) thresholds only luma(B).** The top of the A-chain is never
  key-bounded — bound it with the final monitor (contrast ≥ ~1.8) and put
  a fast-contracting arm (small zoom) in that slot, never the rachis.
- Monitor bright is load-bearing (without it the composite separatrix
  reverts to the erosive contrast pivot). Merged numbers: monitor
  contrast 1.8, bright +0.02; keys 0.45/0.45/0.40 (seed key loosest);
  rachis exposure ~1.02 (coat trim), pinna exposure 1.15 (decimation guard).

## Facts worth keeping

- Identity-geometry camera (rot 0, zoom 1, off 0) is a texel-exact copy
  (interior; the 1.2% edge fade always applies). Its exposure knob is a
  per-arm multiplicative gain/attenuator — the engine HAS per-arm gain.
- Depth is resolution-bound: ~ln(seed_px/1px)/ln(1/zoom) generations
  (~13–15 on a 0.85 rachis from a 10 px seed at 540p; 4K adds ~8).
  Curvature flow costs ~1 generation (per-generation, not per-lap —
  re-derivation resets it). Detail floor diverges as zoom→1 (b/√(1−z²)).
- In-loop color is dead in every gain-restored regime (channels corner-
  collapse or drift white). Geometry in the loop, color on a display-side
  monitor outside it. Seed: WHITE (luma 1.0; red never enters a luma key,
  green tints everything).
- Steady state is identical with or without a leaky identity arm (the
  attractor is exactly self-covering). A leak (identity camera, exposure
  ~0.95, keyed under the union) is purely a transition aesthetic:
  crossfades orphans out over ~1/ε laps instead of the contraction rate.

## The reference patch

`fern.patch.json`-style JSON lives in the conversation record (3 cameras:
rachis 0.85/−3°, pinnae 0.34/±52°, rooted near screen center — camera
translation reach is only ±zoom·0.25, so a bottom-rooted fern is
unreachable; chain KEY(rachisB, pinnaC-as-A) → KEY(+pinnaB) → KEY(+SEED)
→ FERN monitor 1.8/+0.02, all delays 0, lap = 1 tick). Seed: `seed.png`
(repo root) — 960×540 black, white 12×50 bar just below center; drop it
on the SEED source node. Convergence is monotone-from-above: even a
full-screen mush collapses onto the fern in ~1.5 s.

Live dials: CURL (rachis rot, ±20° useful), REACH (rachis zoom — keep
val < +0.2; past zoom 1.0 the screen floods, backs off self-healing),
WIND (both pinna rots, one dial — control fan-out is legal).

Tuning: rachis fat → camA exposure down toward 1.00. Leaflet moiré holes
→ pinna keylvl down toward 0.40 (exposure is already maxed). Un-keyed-arm
edges gray → monitor contrast up toward 2.2. Fern-wide fade → monitor
bright up +0.02 steps. Tip shimmer during dial motion is expected
(subpixel phases migrate) — not damage.

## Feature asks that survived the dialectic (none built yet)

1. **N-input MAX compositor** — chained 2-input keys cut ~1 px notches
   where arms cross (the branch joints); at 3+ arms this is necessary,
   not nice. max() is exact union: monotone, associative, no occlusion.
2. **Seed patterns on SOURCE** (bar/dot, size/position/color) — the boot
   stained-glass is actively hostile as a seed.
3. **Exposure ganged to zoom** (per camera) — kills the one standing
   knife-edge: restoration must track ~1/α(zoom) or depth breathes /
   edges creep when zoom moves.
4. **Camera mirror toggle** — the camera composes rot/zoom/translate
   only; a true Barnsley fern needs one reflected map. (Same flip the
   old HANDOFF mirror question wanted for the towers.)
