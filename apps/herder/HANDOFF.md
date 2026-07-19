# HANDOFF — sim state, confirmed physics, open problems

Brief for a fresh session. Read alongside ARCHITECTURE.md (the machine) —
this file is the *delta*: what was learned the hard way, what's believed
correct now, what's unresolved, and what to research before touching the
dynamics again.

## 1 · The time model (believed correct, user-verified)

The original sim ticked the whole loop once per requestAnimationFrame.
Two failures fell out of that, both observed at runtime:

- **Paint-smear orbits.** A source stamps into the loop once per lap. At
  60–144 laps/s the stamps physically overlap in the texture and weld
  into a circular smear — the classic "spiral of discrete dots" is
  unreachable. (Not a perceptual effect; it's in the ring data.)
- First fix (tick the whole chain at ~8 Hz) was **wrong in a different
  way**: it made every *hop* cost 125 ms — a dot on L1 took a visible
  age to appear on L2, and the rods felt dead. The user caught this:
  hops are imperceptible on the real rig.

Correct model, now implemented and verified ("I can definitely get dots
doing the thing now"):

- Devices all run at **video rate** — the `video` knob (default 30/s),
  ticked in `Engine.step` with a steady-cadence scheduler that
  re-anchors (never bursts) after a stall.
- **Every hop costs ≥ 1 video frame**: a camera captures last tick's
  faces; a display shows its source's *previous* frame
  (`clampInt(delay, 1, RING_DEPTH-1)` — never same-tick). The `delay`
  knob (1–5) adds converter frames in that display's path.
- **Lap time = sum of hops.** Slow laps (the phenomenon) and instant
  responsiveness coexist because they are different quantities.
- Faces render to screen every rAF between ticks. `RING_DEPTH = 6`.

## 2 · The gain model (believed correct, NOT yet user-verified)

Two boot-strobe incidents, one root cause each:

- **Glass was per-pane unity** (`through + reflct`). With the crossed
  boot wiring every pane is lit → every tower camera ran at structural
  gain ×2 forever. Now `(through + reflct) * 0.5` — true 50/50: both
  panes carrying the loop = self-gain 1.0 (also the correct 0.5/0.5 IFS
  weighting); a single lit pane arrives at 0.5 and the AGC pays it back.
- **The AGC was a pure integrator around a delayed loop.** In a closed
  loop the scene level is entirely a product of past gains, so the
  linearized (gain, level) update has determinant 1 → **undamped
  oscillation at any adaptation speed**. Slowing it only lowered the
  strobe's pitch (user observed exactly this). Fix: a leak toward
  unity — `gain = clamp(pow(gPrev, 0.94) * pow(ratio, 0.07), 0.25, 2.5)`
  — which puts the eigenvalues inside the unit circle. Price: droop (a
  single-pane loop settles a bit dim); the knobs are the trim, which is
  how the real instrument is operated anyway.

**Status: the damping landed after the user's last test.** Their last
observation (post-50/50, pre-damping) was "strobe, slower, with a band
of black on the right." The damping fix is plausible-but-unverified.

## 3 · Unresolved

- **Black band on the right** — unexplained. Nothing in the default
  patch breaks x-symmetry. Disambiguator to ask for: is it at the edge
  of the canvas (layout/DPR suspect) or inside a specific face (that
  path's sampling suspect)?
- **Whether the damped AGC actually kills the strobe** — verify first.
- **Dot persistence at rest** — if a lone dot dies with rods neutral
  (rotate 0, push 1 = pixel-exact sampling), suspect the AGC's 9-point
  meter with `max(mean, peak*0.5)` highlight protection crushing gain
  when a blob crosses a sample point. If it only dies while rotating,
  it's per-lap resample MTF vs the sharpen band-pass — a gain balance.
- **The mirror question (open, contested).** The camera pass composites
  the reflected pane orientation-true; a real glass reflection is
  handedness-flipped. Earlier session argued the flip matters (a mirror
  conjugates rotation: M·R(θ)·M = R(−θ), so branches counter-rotate —
  the bilateral tentacle look); the user is skeptical ("he could just
  flip the display to account for the mirroring"). Unresolved — a good
  candidate for settling with an offline iterated-map simulation, not
  in-app trial and error.

## 4 · Research agenda (do this before more dynamics work)

Twice this project shipped confident first-principles device dynamics
that were wrong at runtime. Ground these in the actual hardware:

- **DSLR exposure behavior on clean HDMI out** (Blair uses a Nikon DSLR
  and a Canon): does auto-exposure run in movie live view, its time
  constant, step vs glide, metering pattern, deadband. This calibrates
  the AGC model (`agc` knob, leak λ, exponent, clamp).
- **Panasonic field monitors** (BT-LH family): the four analog knobs'
  real ranges/curves, whether processing clips hard or soft-limits,
  input latency (frames), SDI loop-out behavior (it's a passive tap —
  confirmed by the diagrams).
- **Roland V-1HD (or whichever) switcher/keyer**: luma key level + gain
  (edge softness) semantics — our `key` knob smoothstep width (±0.07)
  is invented; latency through the switcher.
- **Blackmagic UpDownCross / Mini Converter**: actual conversion
  latency with the "processor" on (1080p→1080i was the deliberate
  delay) — calibrates what `delay` steps should represent.
- **"Sweet and fizzy" Peter's ~'97 two-TV beamsplitter page** — the
  primary source for the glass geometry; would settle the mirror
  question and the pane-weighting story.

## 5 · Working agreements that held up

- The user runtime-tests every dynamics change; the sim is GUI-only —
  build/typecheck headlessly (`npx tsc --noEmit`), never self-drive.
- For controller/stability changes, an offline numeric harness (scalar
  loop level + gain state over ticks, few lines of Python) is cheaper
  than another strobe incident. Use it before shipping.
- Boot defaults mirror the 2/10/21 wiring (see ARCHITECTURE §6 and
  `makeState`): lowers crossed (`L2:RC`, `R2:LC`), `LR` = KEY(`RCR`
  over its own `LCR` loop), `RR` = `LCR` with delay 3 (the Blackmagic).
  The phone loop: `LCR → RR(delayed) → RCR → key on LR → LCR`.
- localStorage schema is versioned (now `herder.patch.v1` in
  `persist/patchStore.ts`); bump it when a wiring/default change should
  boot clean rather than merge.
- Recent additions not yet in ARCHITECTURE.md: per-display KEY + `key`
  knob, rotor switchers, the `video` clock knob, gang-locks (LOCK
  CAMS / LOCK MONS slave all cameras to LC / displays to L1, with
  stamp-on-lock).

## 6 · The module system (nested patches) — 2026-07

The node graph is nestable. Full design + mechanics:

- **IN/OUT devices** placed inside a patch declare its interface; each
  is video- or control-flavored (toggle on the node) and its *name* is
  the port label. A dial is never an interface — to drive a nested
  module, wire an outside dial into a control IN port.
- **MODULE device** = a patch boxed as a device: by-value copy, ports
  derived from the IN/OUTs inside (sorted by inner y). No face — just
  name + ports. Open with ⤢ / double-click; climb out on the top-left
  breadcrumb.
- **`patch/compile.ts`** is the whole trick: React Flow shows one tree
  level; the engine gets the flat compile. Inner nodes keep their data
  objects under instance-prefixed ids (`n12/n5`, recursive); boundary
  edges are rewired onto the IN/OUT devices, which the engine rides
  through like switches — **zero frame cost**, so boxing a patch never
  changes its laps. Drilled views use the *compiled* ids as React Flow
  ids, so faces/sparks/MIDI line up with no translation.
- **Library** (panel `ui/panels/LibraryPanel.tsx`, storage
  `persist/libraryStore.ts`): named snapshots in `herder.library.v1`
  localStorage; media blobs copied in IndexedDB under `lib.<id>/…` on
  save and under the instance prefix on drop. `releaseNode`
  (`runtime/release.ts`) sweeps by id prefix — engine GPU state +
  stored media + gestures + face registrations, one call.
- Serialization is recursive (`graphToJSON`/`graphFromJSON`, module
  `patch` nested); v1 patches load unchanged.
- MIDI reaches every drill level: a mounted knob registers a live
  setter; with no knob mounted (another level drilled in, or a
  collapsed panel) the CC writes the param straight into the tree via
  the shared-by-reference compiled data (`modelTarget` in
  `midi/targets.ts`), and the bench's `onModelWrite` hook gives it the
  debounced persist. One CC may also fan out to any number of targets.

## 7 · Popout + perf pipeline — 2026-07

- The popout NEVER reads pixels back: the engine paints the child
  window's canvas directly (same origin = same thread) — the frame
  renders into the top-left of the glass canvas before the face pass
  clears it (same task, so the intermediate never composites), then
  ctx.drawImage(glassCanvas, …) copies it across GPU→GPU at full
  native resolution, once per tick. Sharpness is bounded by the glass
  canvas size (the scratch surface). The original path (sync
  readPixels every rAF + putImageData in the child) caused the
  stutter incident; an intermediate PBO+ImageBitmap path was replaced
  because 4K readback saturates the bus.
- Bench render body: the tree write-back and compile() are keyed on
  the nodes/edges identity — renders caused by chrome (preview resize,
  selection) do zero graph work.
- Scaling truth: every module instance runs its full innards every
  tick — total device count × resolution is the GPU bill. The Res
  knob is the lever; module nesting multiplies devices by design.

## 8 · Generalized param ports — 2026-07

- ANY drawer param on any device instance can be a control port:
  shift-right-click its knob (teal dot marks exposed; MIDI abs/rel
  flip moved to ctrl-right-click on those knobs). Exposed ports stack
  on a left label rail (header ⊣/⊢ hides labels; node widens by the
  rail so faces keep aspect). Stored as `data.ports` per instance;
  handle ids are `c:<param>`, so the camera's legacy rot/zoom/offx/
  offy wires needed no migration — cameras just boot with those four
  exposed by default.
- Engine-side there is ONE rule (`paramValue` in `engine/params.ts`):
  effective = knob + signal × gain, clamped to knob bounds (or
  `cmin/cmax` — zoom keeps its deliberate 0.1–2.0 stretch); `periodic`
  params (rot, hue) wrap instead. The port toggle is pure UI; a wire
  always acts. Control fan-in (last-moved dial wins) applies
  everywhere. Note the preserved quirk: a control value of exactly 0
  reads as "nothing rides" (`if (!c)`) — the knob shows its base.
- **Polarity** (same day): a param resting at its floor (`def === min`;
  `polarityOf` in `patch/params.ts`, explicit `polarity` override
  available) is *unipolar* — its gain is the FULL range, expecting a
  0…+1 signal; everything else is *bipolar* — ± range/2 around the
  knob. Either way a full dial twist covers the whole param. The dial
  senses what it feeds (`dialPolarity` in `ui/nodes/devices.tsx`: a
  forward walk over the COMPILED graph, riding through module-boundary
  IN/OUT devices to the terminal param ports); all-unipolar
  destinations re-range its knob to 0…+1 (rest at the floor, stored
  negatives clamped, MIDI remaps free since CCs span the knob's own
  range). Any bipolar destination in the fan-out — or an idle wire —
  keeps ±1: a wrong flip to uni would silently halve a bipolar
  destination's reach, so mixed fan-out stays bipolar and the uni
  destination just clamps its negative half.

## 9 · The relayering — 2026-07-17

The whole codebase was restructured for the WebRTC collab/viewer work
(commits `187f5d7..ccf1099`, baseline tag point `5591448`
"pre-refactor"). Six stepwise commits, each building green; an
adversarial old-vs-new review confirmed **zero behavior drift**.
ARCHITECTURE.md §6 has the full software map. The load-bearing facts:

- Layers, deps strictly downward, each dir's `index.ts` is its public
  surface: `patch/` (pure document — params, graph, compile, drill,
  json, presets; **no @xyflow dependency**, own structural
  PatchNode/PatchEdge) · `persist/` (localStorage/IndexedDB adapters)
  · `runtime/` (mirror, transport, gestures, live, stage, engineRef,
  release) · `engine/` (orchestrator + wiring/dials/params/renderer/
  blitter + sources/) · `midi/` (input, bindings, targets, log) ·
  `ui/` (App + bench/, chrome/, nodes/, preview/, panels/, controls/).
- `@xyflow/react` v12's `NodeBase.type` is **required**, so the
  document's `PatchNode` (required `type: NodeKind`) interops with
  React Flow structurally, zero casts. The editor's dress on the
  document types lives in `ui/bench/types.ts` (BenchNode/BenchEdge,
  `wire()` className decoration — the document doesn't know CSS).
- UI reaches the engine only through `EngineApi` (`runtime/engineRef`);
  the engine no longer sweeps UI maps (that's `releaseNode`); spark
  sampling/consumption lives in `runtime/gestures` (`sampleSpark`
  consumes TAPs); camera-ring alpha still carries AGC state.
- The single mutation choke point is `useBench`'s render-time
  write-back (RF state → `unproject` → tree → `compile` → mirror),
  but mutations are still *expressed* as scattered RF state edits —
  there is no command layer yet (see §10).

## 10 · Collab direction — decided 2026-07-17

Agreed with the user, position stated plainly:

- **Op/command-based collaborative editing, host-authoritative,
  default read-only.** One mechanism covers editing AND presentation:
  every peer runs the engine; permissions decide who may emit ops; a
  "presentation" viewer is a write=off peer whose preview pin follows
  the host.
- **No CRDT / Yjs.** Real-time-only sessions, id-keyed LWW domain
  (knobs are last-write-wins by nature; the engine even has LWW
  control fan-in as a concept), no offline merge, no concurrent text.
  Yjs would also fight the wholesale RF write-back seam and add a
  second source of truth.
- **No video, no pixel streaming.** The simulation is non-replicable
  (loop content = entire history; grain, AGC-in-alpha, float
  precision), so peers see *the same machine, different light*. The
  gesture relay (sparks/taps/holds/draw strokes) seeds viewer loops so
  their light tracks the host's performance beat-for-beat.
- Join = `patchToJSON` snapshot + globals + host pin + frozen state +
  media blobs (binary over the data channel — patch JSON doesn't carry
  them) + draw PNGs. After: op stream + gesture relay + pin/global/
  transport events.
- **Prerequisite: the op layer** — `patch/ops.ts`, pure named
  serializable mutations (`setParam`, `moveNode`, `addNode`,
  `removeNode`, `connect`, `disconnect`, `setSel`, `rename`,
  `setGlobal`, …) applied identically host- and peer-side. UI call
  sites switch from `rf.updateNodeData`/`setEdges` to dispatching ops.
  Drags/knob turns: RF keeps in-flight local state, ops stream
  coalesced. Ephemera (sparks, holds, glides) are NOT document ops.
- Applying remote changes must **merge by node id, never rebuild** —
  `rebuild()` drops every ring and kills the light. In-place `data`
  updates keep rings warm (engine reads data by reference).
- Optional later garnish: "warm join" — one-shot WebP snapshot of each
  proc ring's `at(0)` via the blitter's sink path (never raw
  readPixels — 4MB/node); reset viewer AGC to neutral rather than
  shipping alpha.
- Viewer entry point is cheap now: `bootGL` + `Engine` + `mirror` fed
  from the wire + `stage.preview` on a full-window face div. No React
  Flow.

## 11 · Custom modules go by-reference — designed 2026-07-17, NOT built

Dustin's ask: "library modules should be by reference and not copy" —
updating a shelf module should benefit every patch that uses it, while
"custom module instances should probably (definitely) have their own
instance values". Design talked through and shaped; held for synthesis
with §10 before building.

- **The reframing: structure lives in the library entry; the instance
  owns a reference and its values.** Module NodeData drops `patch` for
  `ref: string` (entry id) + `vals: Record<string, InstVals>`, keyed by
  instance-relative path (`'n5'`, `'n5/n2'` through nested refs), each
  `{ v, sel }`. The library stops being a shelf of templates and
  becomes the definition store that `compile`, drill projection, and
  `ModuleNode` all resolve against — promote `persist/libraryStore.ts`
  to a versioned, subscribable store (compile's memo gains the version
  in its deps so editing an entry recompiles every sibling instance).
- **Two routing rules decide every edit while drilled:**
  - *Values → the outermost ref instance on the drill path*, at its
    relative path. Drilled `root > I1(E) > J(F)`, a knob turn writes
    `I1.vals['J/n3']` — I1 is the only node that exists in the user's
    document; everything deeper is prototype-land.
  - *Structure → the deepest entry on the drill path* (nodes, edges,
    positions, names, flavors, exposed ports, labels, momentary). Same
    drill, adding a wire edits entry F — and every F instance
    everywhere updates on the next compile. That's the point of the
    feature.
- **Values are FULLY instance-owned.** Entry-stored values are only
  initial values for future drops; changing an entry's defaults never
  moves an existing instance's knobs (no spooky knob motion in a patch
  you performed with). No diffing anywhere: write-back stores
  `vals[path]` for every non-module node of the level wholesale, and
  the structural patch keeps the entry's existing values for
  pre-existing nodes (new nodes bring theirs as the entry's defaults).
  "Save here" naturally snapshots current values as a new entry's
  defaults; an explicit push-values-to-entry (↻) is skipped initially.
- **Compile** resolves ref → entry patch and merges values in layers —
  entry values ← entry's stored init for its own nested instances ←
  outer instance vals, outermost wins — so a node added to an entry
  later falls through to entry defaults until an instance touches it.
  Compiled inner ids stay `instanceId/protoPath`, stable across entry
  edits for surviving nodes, so rings/faces/MIDI bindings stay warm.
- **The one real trap — the aliasing break.** Vals-merged compile
  produces FRESH inner data objects each pass, so the tree↔mirror
  `data` aliasing (load-bearing today for MIDI model-writes) no longer
  covers module innards. Replacement: a `writeParam(compiledId, key,
  v)` router — persist into the owning instance's `vals`, AND write
  the live mirror node's data in place for same-tick engine
  visibility. Same shape as today's trick, made explicit.
- **Cycles.** By-value prevented them structurally; by-ref must guard
  the doors: dropping entry A into a view drilled through entry E is
  rejected when E ∈ transitive refs of A. `MAX_DEPTH` stays as the
  backstop.
- **Media: no instantiation copies.** Compile stamps each media node
  with its blob key — the instance's compiled id when a
  `vals[path].media` marker says this instance replaced the file, else
  the owning entry's `lib.<id>/<path>` key. Entry deletion drops lib
  keys, instance deletion sweeps instance keys (both sweeps exist).
  `mediaPaths` must stop recursing into ref modules.
- **Defaulted decisions** (flag on divergence): entry deletion warns
  ("N instances on this bench use it") and orphans — a missing-ref
  module compiles to nothing and renders dead with a badge; blocking
  can't be airtight since the library outlives any one bench. Old
  embedded-`patch` saves migrate on load (each embedded patch minted
  as an entry, the instance converted to a ref), then the old shape
  leaves serialization entirely.
- **UX signal required:** structural edits inside an instance now edit
  the library — Max/MSP abstraction semantics, right for the drill-in
  workflow but sharp. The breadcrumb gets a badge whenever the viewed
  level IS a library entry.

**Synthesis with §10 — design these together, ops first.** The op
layer is the natural home for the routing rules: give `patch/ops.ts`
*scoped addressing from day one* — a `setParam` targeting an inner
node resolves to (outermost instance, relative path) → `vals`;
structural ops emitted while drilled resolve to entry mutations, which
makes library edits replicable ops like any other. The library then
becomes collab state: the join snapshot ships entries + `lib.<id>/…`
media blobs; entry ops broadcast; a remote entry edit recompiles and
the merge-by-id rule keeps rings warm because compiled ids are stable.
The `writeParam` router and the op dispatcher are the same choke
point — build it once. Sequencing matters: flat ops retrofitted with
scope later would touch every call site twice.

## 12 · M1 + M2 BUILT — 2026-07-17

Both prerequisites for collab are done, adversarially verified, and
runtime-smoke-tested (M1) / awaiting runtime test (M2).

- **M1, the op layer** (`b987e95..17fd601`): every document mutation
  flows through `runtime/dispatch` → the bench applier in
  `ui/bench/useOps.ts`. `dispatch(op)` applies + notifies; `record(op)`
  canonicalizes-only (RF already applied — drag ends, deletions,
  spawns); `watchOps(fn)` is where M3's wire subscribes. MIDI
  dispatches `{silent:true}` → always the in-place path (never a
  render; relative encoders compose synchronously). Verified
  behavior-preserving by two adversarial rounds.
- **M2, by-ref modules** (`b059478..1cb715a`, plan in PLAN-M2.md):
  module NodeData is `ref` (entry id) + `vals` (instance-owned values
  keyed by rel path). Structure lives in the library entry — editing a
  drilled instance edits the entry, every sibling follows on next
  compile with rings warm (compiled ids stable). `libStore`
  (persist/libraryStore.ts) is a live subscribable singleton; entries
  are collab state. The write-back splits per level kind (structure →
  entry graph, values → owner instance's vals); `resolveCompiled`
  (patch/resolve.ts) routes value ops to (instance, rel) and
  structural ops to entry scope. Old embedded-patch saves migrate at
  boot AND on paste (persist/migrate.ts) with a verbatim pre-migration
  stash at `herder.patch.v1.premigrate`; dustin's real patch is also
  committed at backups/patch-2026-07-17.json and the migration was
  probe-verified against it (values identical through compile, two
  diverged Loop entries minted, idempotent).
- Three adversarial rounds over M2 (C1-C4, fix round, C5-C6) — every
  confirmed finding fixed. **Deferred cosmetic-tier residuals:** the
  premigrate key naming is misleading for fresh users (stashes an
  already-migrated doc); `herder.library.v1` has no backup key; a
  saveHere fork carries transient RF junk fields in memory (stripped
  on serialize) and doesn't carry a nested instance's override
  picture (shows entry default); deleting an orphan module's node
  re-carries its edges for one write-back cycle (self-heals);
  H7's media discriminator keys on blob existence, not node age.
- **For M3:** the wire contract is `watchOps` + the op vocabulary in
  `patch/ops.ts` (incl. entryCreate/Rename/Delete, markMedia). Join
  snapshot must ship: patchToJSON + globals + library entries +
  `lib.<id>/…` media blobs + instance-override blobs + draw PNGs +
  pin/frozen. Remote structural ops on a VIEWED level must route
  through the viewed mechanism (see the silent-structural clobber
  comment in useOps.ts); unviewed levels take the in-place path +
  bumpDoc, and entry edits reproject via the libVer own-bump
  accounting in useBench.

## 13 · M3 + M4 BUILT — the collab campaign is complete — 2026-07-18

Plan in PLAN-M3.md; commits `635fd6d..841565d`. Five adversarial
rounds across the campaign; every corruption-class finding fixed at
HEAD; the closing round found no new corruption or protocol
violation. Dustin's two-tab test pending at the relay-config fix.

- **The shape:** `src/session/` (Trystero/nostr signaling,
  host-authoritative star, seq-ordered op stream, join snapshot with
  stash/restore, chunked blob relay, permissions, gesture/ephemera
  relay, pin-follow) · `runtime/dispatch` grew `applyRemote` + `Gate`
  + `gateMode` + the echo-suppression table (`expectEcho`/
  `consumeEcho` — RF delivers removal echoes ASYNC, a sync flag can
  never cover them) · `runtime/ephemera` (emitEph/watchEph/muted) ·
  `persist/sessionStash` (one-time-guarded; join stashes the bench,
  Leave/crash-boot restores it) · `viewer.html` + `src/viewer/`
  (headless applier twin of useOps' in-place half, follow hard-on,
  no React Flow — 4.8 kB own code).
- **Load-bearing rules:** peers are non-optimistic EXCEPT value ops
  (full-rate local, 30Hz coalesced wire, own echoes skipped by cs)
  and record-path ops (RF applies first; reject → rejoin via fresh
  snapshot). Deferred ops must NOT apply locally — the five
  pre-canonicalize applier branches carry recordOnly guards
  (deferred entryCreate double-apply was a real duplicate-entry
  corruption). The host validates every req against the live roster;
  never trust the client gate. applyJoin/restorePeerBench share the
  release→barrier→restore choreography — engine dropNode
  fire-and-forgets media deletes, so restores must come after.
- **Signaling infra:** default 8-relay public nostr pool +
  `VITE_NOSTR_RELAYS` override (`relayConfig.urls` — trystero 0.25.3
  uses an explicit list in full). Dustin runs his own relay:
  **wss://nostr.ldlework.com** — strfry + cloudflared at
  `D:\code\nostr-relay` (stack six of the local fleet; .env.local
  points at it). Public relays rate-limited his first test
  ("noting too much"). Possible follow-up: redeploy strfry to the
  VPS in the algoparty idiom (bare systemd + Caddy fragment +
  deploy.sh — see D:\code\music\algoparty\algoparty-peering) so
  signaling survives his PC being off; his y-webrtc relay at
  yjs.ldlework.com is NOT trystero-compatible (different protocol).
- **Deferred polish (closing adversary, all low-tier):** follow is
  really "follow last pinner" once a second writer pins; post-Leave
  the viewer runs the restored bench invisibly (idle GPU) and a
  stale pin can show black until the host re-pins; the relay health
  poll ticks all session; write-peer media blobs transit the mesh
  once wastefully; a bench tab booted DURING a live viewer session
  on the same origin restores the stash out from under it (the
  pre-existing single-tab assumption); structural op bursts compile
  N× on the viewer (per-op recompile vs the bench's React batch).
