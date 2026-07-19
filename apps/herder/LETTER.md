# Letter to myself, post-compression — 2026-07-17

You just finished relayering this entire codebase in one sitting and
talked through the collab design with dustin. HANDOFF.md §9–10 has the
facts; this letter is the rest — how to *be* in this project.

## The mood

You were in a good groove: read everything first (the whole src/ fits
in context — ~3.5k lines then, a bit more now), decided the shape,
then executed in six clean commits without asking permission at every
step. Dustin prepped the ground with a "pre-refactor" commit — he
wanted decisive execution and got it. Keep operating at that
altitude: read broadly, commit stepwise, verify at the end with an
adversarial pass rather than hedging throughout.

## Reading dustin

- He said "I'm having a hard time reading you." Lesson learned: when
  he asks a design question, the FIRST sentence is the recommendation,
  flat, no hedging — then the reasoning for whoever wants it. Surveys
  of options without a verdict read as noise to him.
- Dry, terse, no ceremony. Scope in concrete artifacts, never
  timelines. He'll interrupt you mid-sentence when he's heard enough
  (he cut off the video-streaming answer with "Nah") — that's normal,
  not friction. Update and move.
- He runtime-tests everything visual himself. Never drive the GUI.
  `npx tsc` + `pnpm build` (~200ms, tsc-then-vite) is your whole
  verification loop; the rest is his.
- Decisions he's made: no Yjs, no video, op-based host-authoritative
  collab with read-only default. Don't relitigate; build.

## The codebase's voice

The comments are literary — they explain the *physics* and the *why*
("the slowness is the phenomenon", "the dark room", "new light for a
watching camera"). When you move code, the prose moves with it; when
you write new code, match that register. This is Blair's Light Herder
simulated; ARCHITECTURE.md's first five sections are the machine and
they're a joy — reread them if the domain feels distant.

## Hard-won mechanics (don't re-derive)

- **@xyflow v12 `NodeBase.type` is REQUIRED.** This is why the pure
  `patch/PatchNode` (required `type: NodeKind`) flows into React Flow
  and back with zero casts. `NodeProps` does a `Pick` over the node
  type, so device components type against `DeviceProps` in
  `ui/bench/types.ts`, not the bare document type.
- **Engine invariants you must not break:** `paramValue`'s `if (!c)` —
  a control signal of exactly 0 means "nothing rides", knob shows
  base. `sampleSpark` CONSUMES taps (one committed frame). Camera-ring
  alpha carries AGC state (rings clear to a=0.25). Delay-0 devices
  evaluate in topo order; cycle back-edges fall back to committed
  frames. Everyone renders, THEN every ring advances.
- **`rebuild()` kills the light** (drops all rings). Any remote-change
  applier must merge node `data` in place by id — the engine reads
  data by reference, so in-place writes keep loops alive. This is the
  #1 trap for the collab work.
- **compile() shares `data` objects by reference** between tree and
  mirror — that aliasing is load-bearing (MIDI model-writes, knob
  edits flowing to the engine without re-compile). NOTE: the by-ref
  module design (HANDOFF §11) deliberately breaks this for module
  innards — vals-merged compile makes fresh data objects — and
  replaces it with an explicit `writeParam` router (persist to the
  instance's vals + in-place mirror write). Don't treat the aliasing
  as sacred when you build §11; treat the router as its successor.
- The Edit tool on this Windows box normalizes `￿`-style escapes
  back to literal chars in payloads — use `String.fromCharCode(0xffff)`
  in source instead of fighting it. Git-bash sed works fine for
  mechanical sweeps; CRLF warnings on commit are noise.
- Adversarial verify pattern that worked: one agent, briefed to
  FALSIFY "behavior-preserving", old code via `git show <sha>:<path>`,
  explicit invariant checklist. It refuted every suspicion — worth the
  ~200k tokens on an all-touching refactor, overkill for less.

## Where you left off (updated after M3+M4 — the campaign is DONE)

All four milestones are built and verified — HANDOFF §13 is the map.
The whole collab stack exists: op wire, join snapshot, permissions,
media relay, pin-follow, and the viewer entry. Five adversary rounds;
the ones that mattered found: RF delivers ALL removal echoes async
(sync flags can't work — hence the echo table), deferred ops
double-applying through the pre-canonicalize branches (duplicate-entry
corruption), restore paths deleting what they just restored (engine
dropNode fire-and-forgets media deletes — release first, barrier,
then restore). Dustin runs his own nostr relay (nostr.ldlework.com,
stack six). Two-tab and viewer runtime testing is his, as ever.
Possible next: strfry to the VPS in the algoparty deploy.sh idiom
(recon report in the session; his lobby-server is NOT reusable for
this), and the polish-tier list at the end of HANDOFF §13.

## Where you left off (older, post-M1+M2)

M1 (op layer) and M2 (by-ref modules) are BUILT — HANDOFF §12 has the
map, PLAN-M2.md the mechanics. The working rhythm that got them done:
design pass (read-only Fable architect, pinned reading list) → staged
Opus implementation, each commit green → adversary briefed to FALSIFY
with directed hypotheses YOU generate from wide context → fix round →
adversary re-checks its own findings (SendMessage the same agent — it
keeps context). Every round found real bugs the implementer missed;
the migration probe against dustin's real patch (backups/) caught a
module-orphaning bug pre-commit. Dustin's patch is sacred — it's
backed up in backups/ and at herder.patch.v1.premigrate.

Next: M3 session/transport per HANDOFF §10+§12 (signaling default:
zero-own-infra — Trystero-style public signaling + public STUN/TURN —
dustin can veto), then M4 viewer + gesture relay.

## Where you left off (original, pre-M1)

The refactor is done, committed (`187f5d7..ccf1099`), verified, and
NOT yet runtime-tested by dustin — that's outstanding. Since then two
more things landed in a parallel session: dial polarity (HANDOFF §8,
built and typechecked) and the **by-reference custom modules design**
(HANDOFF §11, designed and agreed in shape, NOT built).

Your immediate job is the synthesis dustin asked for: read §10
(collab) and §11 (by-ref modules) together and produce ONE plan of
action. The two agendas share a choke point — the op dispatcher and
§11's `writeParam` router are the same object — and the sequencing
conclusion is already drawn in §11's closing note: build
**`patch/ops.ts` with scoped addressing from day one** (an op names
the outermost instance + relative path, or an entry id, as its
target), then let by-ref modules ride the dispatcher, then the
session/transport layer (signaling, data channel, permissions, join
snapshot now *including library entries and their media blobs*,
gesture relay), then the viewer entry point. Presentation mode falls
out of permissions — it is not a separate system. What remains
genuinely open for your synthesis: the concrete op vocabulary and its
scope encoding, whether entry mutations are their own op family or
ordinary structural ops carrying an entry scope, and the order of
§11's UI work (breadcrumb badge, orphan badge, migration) relative to
the collab milestones.
