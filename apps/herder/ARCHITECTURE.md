# The Light Herder — the full instrument

Engineering description distilled from four sources: the feedback demo
(transcript1), the "final iteration" build video (transcript2), the 2010 concept
note (transcript3), the dual-loop schematic notes (transcript4), and the 2/2/21
hand-drawn wiring diagram ("HD Video Feedback Kinetic Sculpture — Dual Loop /
Dual Switcher").

This is the FULL device: **6 monitors, 4 cameras (the phone's counts), 4
switchers, 2 panes of glass, 1 handle.**

```
   UPPER-L   UPPER-R        M = Panasonic field monitor (4 analog knobs each)
   GLASS     GLASS          G = 45° 50/50 teleprompter glass
   LOWER-L   LOWER-R        C = camera on a rod (rotate + push/pull)
     ‖          ‖
    CAM-L    CAM-R          the two rods are BELT-LINKED — one handle
     ‖ ========= ‖             drives both, relative rotation adjustable
   HANDLE    FRONT-M        FRONT-M = rotating monitor (the MONITOR spins)
             CAM-F          CAM-F = fixed camera looking at FRONT-M
                            PHONE = external image/video source
```

---

## 1 · The atom: a monitor structure (tower)

Each tower is the beamsplitter feedback unit (transcript2, 9:15–9:56):

- **Upper monitor** seen *through* the glass (50%).
- **Lower monitor** *reflected* in the glass (50%) — a real reflection, so the
  copy is **handedness-flipped** (one axis mirrored). This is what makes the
  iterated map branch (trees, leaves) instead of merely spiral.
- **The camera** integrates both in one optical path. Each feedback iterate
  therefore superimposes two differently-warped copies of the previous frame —
  literally an iterated function system. That is the fractal engine.

**The rod = the yoke** (transcript3): the camera moves *"forward, backwards, and
360 degrees around its axis."* Two DOF:

- **Push/pull** → camera-to-monitor distance → **zoom** per iterate.
- **Rotation** → an absolute held angle → **rotation** per iterate.

Lateral offset is *not* a performance control — it's the mount-alignment
adjustment (transcript2, 6:16: play in the mounting holes to center the lens on
the shaft axis). Deliberate slight misalignment = off-axis spirals.

**Coupling strength is a brightness knob.** The glass is fixed 50/50; what makes
the second image assert itself is the *lower monitor's* brightness/contrast
(transcript1, 2:38: "now I'll turn up the brightness of the lower monitor...
this is when things get really freaky").

## 2 · The five monitors — knobs and inputs

Every monitor is a Panasonic field monitor with a remoted control module
carrying **four analog knobs — hue, brightness, saturation, contrast — plus
input select** (transcript2, 11:19–11:43). Per-monitor, not global: the two
monitors of a tower routinely sit at *different* operating points.

Each monitor uses two inputs:
- **Input 1** — its own structure's camera, direct. (Self-loop.)
- **Input 2** — a switcher. (Something else mixed into the loop.)

Placement is also live (transcript2, 11:05): upper monitors **raise/lower**;
lower monitors **slide** and **flip 180°**. These reposition the two copies the
camera composites — structural pattern controls.

## 3 · The rig mechanics that matter

- **Belt-linked rods** (transcript2, 4:26–7:12): linear motion of one rod
  transfers to the other with zero lag; rotation transfers through a V-belt.
  One handle plays both towers. Relative rotation between the two cameras is
  settable (greased belt slip) — e.g. one camera at 90° while the other holds
  180°. → In software: one master {rotate, push} + a **twin offset** for tower R.
- **The rotating front monitor**: the *monitor* spins on bearings; the front
  camera is fixed. A monitor held at angle φ rotates the loop content by φ per
  iterate — same math as rotating the camera, but the rotation is visible to
  the audience and can free-spin.
- **Damped free motion**: sticky grease so the rig holds position when released.

## 4 · The signal graph

Confirmed by the 2/2/21 diagram (SDI loop-outs on the monitors carry each
structure's camera signal out; "Nikon sees upper monitor"; "Canon sees rotating
monitor"; Roland Switcher/**Keyer**; Blackmagic converter as a deliberate delay).
Final-form routing (transcript2, 11:59–12:23):

| Switcher | Source 1                  | Source 2                   | Feeds            |
|----------|---------------------------|----------------------------|------------------|
| SW1      | camera L                  | tower R output (= cam R)   | L monitors, In-2 |
| SW2      | camera R                  | SW3 out                    | R monitors, In-2 |
| SW3      | tower L output (= cam L)  | SW4 out                    | SW2              |
| SW4      | phone                     | camera F (sees front mon)  | front mon In-2, SW3 |

A "structure output" is that structure's camera signal (the composite it sees),
tapped via SDI loop-through. Switchers are operated by buttons or **foot pedals**
so hands stay on knobs and handle.

**Keying** (transcript4): the Rolands don't just cut — they can *luma-key* one
source over the other ("the phone keyed over that loop", "the main switcher keys
that second-input loop over the main loop"). So each switcher has three states:
S1, S2, KEY.

**Delay as an instrument** (transcript1 0:56, transcript4 notes): format
converters add frames of latency; the Blackmagic box was chosen *because* its
conversion delay changes the loop. Delay in the self-path slows degradation
("makes the image last longer"); delay in cross-links changes the phase of the
inter-tower dance.

### The phone loop — keying as electronic glass

The latest evolution adds a **second rotating monitor** and promotes the phone
from source to *loop participant*:

- The Canon's output goes to rotating monitor 1 (through the switcher) **and**
  to rotating monitor 2 through the Blackmagic converter (delay included).
- The **phone's camera** looks at rotating monitor 2; the phone's output feeds
  Source 2 of the secondary switcher.
- Luma-keying the phone loop (S2) over the Canon feedback (S1) makes the two
  loops influence each other — **keying does electronically what the
  beamsplitter glass does optically** on the primary loops. Same superposition,
  different mechanism: glass = linear 50/50 sum; key = brightness-gated
  substitution.
- The phone can still supply stored images instead (media mode), for the
  trapped-image trick.

So the secondary subsystem is a *cross-device* loop:
`phone-cam → switcher(key) → monitor F1 → Canon → converter → monitor F2 → phone-cam`.

### The canonical configurations

1. **Trapped image** (transcript1 0:07, transcript4 §15): front monitor shows
   the phone; flip SW4 (or the monitor's input) to the front camera and the
   phone's **after-image is trapped** in the front loop, circulating.
2. **Mixed in** (transcript1 1:22): lower monitors on Input 2 → the other
   tower's image enters through the glass; its brightness knob is the mix gain.
3. **Infinite within the infinite** (transcript2 12:46): L monitors show R's
   output while R monitors show L's → the towers create each other. All four
   screens affect all the others.
4. **Everything at once**: right tower watches SW3→SW4 → the front loop (with
   phone keyed in), left tower watches right → three nested loops + injection.

## 5 · As computation

Textures = signals. Every hop through a device is one frame of delay.

```
per frame N:
  camL[N] = lens_L( 0.5·warp(monUL[N−d]) + 0.5·mirror(warp(monLL[N−d])) )
  camR[N] = lens_R( … same with twin-offset rotation … )
  camF[N] = lens_F( rot(φ)·monF[N−d] )                    φ = front monitor angle
  sw4 = mode( phone,        camF[N−k] )                   mode ∈ {S1, S2, KEY}
  sw3 = mode( camL[N−k],    sw4 )
  sw2 = mode( camR[N],      sw3 )
  sw1 = mode( camL[N],      camR[N−k] )
  monX[N] = knobs_X( inputX==1 ? cam_of(X)[N] : sw_of(X) )   ×5 monitors
```

- `warp` = rotate(θ) ∘ scale(push) ∘ off-axis translate; `mirror` flips one axis
  and applies lower-monitor slide/flip-180.
- `lens` = 5-tap focus blur, exposure gain, per-channel sensor grain (grain is
  the color seed — saturation/hue amplify it), monitor-edge black beyond frame.
- `knobs` = +brightness → contrast about mid-gray → saturation → **absolute**
  hue rotation (an absolute knob applied every pass = the traveling rainbow).
- **Where loop gain lives**: exposure × contrast (multiplicative) + brightness
  (additive), clamped [0,1] by the monitor. Glass gives self-gain 1.0 when both
  monitors carry the loop; putting the lower monitor on Input 2 halves self-gain
  and substitutes coupling — the exact trade Blair performs.
- `d` = self-loop delay ("processor" frames), `k` = cross-link converter delay.

The image exists only while it circulates (transcript3: it "comes from itself,
and exists only because it exists"). Black stays black until a spark; one
interruption and that exact pattern is gone forever.

## 6 · Software realization (this repo)

Vite + TypeScript, WebGL2, half-float ping-pong rings.

**Routing departure (deliberate).** The four hardwired switchers are how the
*hardware* reaches its routes; they are plumbing, not meaning. The sim routes
per-screen instead: every monitor picks one of the five signals directly,
with an optional per-screen luma-KEY over its own loop. This makes the sim's
reachable configurations a superset of the hardware's (e.g. UL can show MEDIA;
no cable runs there in the real device). Foot pedals become one per screen:
kick a screen to its own loop and back — the trapping gesture.

| Real thing                        | Software                                      |
|-----------------------------------|-----------------------------------------------|
| 5 monitors                        | 5 texture rings (640×360 ×4-deep history)     |
| 3 cameras                         | 3 texture rings + `camera.frag` (glass composite in-loop) |
| the Roland switcher/keyers        | per-display switchers (lowers + rotors; a rotor's own camera closes its loop) and a per-display KEY toggle + Key-level knob: the pick luma-keys over the self-loop |
| phone                             | generated stained-glass texture; drag-drop image/video |
| handle (both rods)                | drag a tower: x = rotate, y = push; twin-Δ knob |
| rotating front monitor            | drag the front monitor to spin; spin-rate knob; quad visibly rotates |
| 4 knobs × 5 monitors              | per-monitor knob modules in the deck          |
| monitor placement                 | lift / slide / flip-180 controls              |
| converter delays                  | proc (self) + link (cross) delay knobs, ring taps |
| NTSC device cadence               | Video knob: the chain ticks at N frames/second; every hop costs ≥1 frame (Delay = converters); faces render every rAF |
| the operator riding brightness    | Herd servo per loop + middlespace meters (L/R/F) |

Layers, dependencies pointing strictly downward (each directory's
`index.ts` is its public surface):

```
src/
  patch/              the pure document domain — no DOM, GL, or React Flow
    params.ts           knob definitions (ranges, defaults, control polarity)
    graph.ts            node/edge shapes, kinds, ports, construction
    compile.ts          module flatten pass (what the engine runs)
    drill.ts            drill-in view mapping (level ↔ compiled ids)
    json.ts             the JSON dialect (clipboard / storage / library)
    presets.ts          the piece & duo machines
  persist/            storage adapters (everything that outlives a reload)
    patchStore.ts       the bench (localStorage)
    libraryStore.ts     library entries + snapshot/instantiate
    mediaStore.ts       dropped media blobs (IndexedDB)
    prefs.ts            preview monitor settings
  runtime/            live session state shared by React, engine, MIDI
    mirror.ts           the compiled patch + globals the engine reads
    transport.ts        the freeze switch
    gestures.ts         sparks & momentary holds (performance transients)
    live.ts             engine → knob feedback for ridden params
    stage.ts            DOM rects the blitter paints into (faces/shields/preview)
    engineRef.ts        the engine as a narrow EngineApi shape
    release.ts          cross-layer teardown for a departed node
  gl/                 WebGL2 primitives: context boot, program link, rings, GLSL
  engine/             the simulation — orchestrator + subdomains
    engine.ts           the tick loop, ring/source ownership, video-in resolution
    wiring.ts           per-tick graph index; producer/control resolution
    dials.ts            control-signal glide state
    params.ts           effective param = knob + riding wire
    renderer.ts         the pure-GL device passes (camera/monitor/mixer)
    blitter.ts          overlay faces, stencil stacking, popout sink
    sources/            media & draw textures
  midi/               the controller patchbay
    input.ts            Web MIDI access + decode
    bindings.ts         source→target table, learn mode, persistence
    targets.ts          where messages land (knob setter / model write)
    log.ts              the monitor's ring buffer
  ui/                 React only
    App.tsx             provider + Bench
    bench/              the editor: useBench (tree/drill/mirror), persistence,
                        clipboard, spawn, dnd protocol, boot, editor types
    chrome/             fixed panes: Crumbs, Toolbar, Transport, GlobalsBar, UtilBar
    nodes/              device visuals: Shell chassis, devices, sources, modules, icons
    preview/            the preview monitor: pin logic, pane, popout window
    panels/             library shelf, MIDI log
    controls/           Knob / ArcGauge primitives
  main.tsx            composition root
```

The single-file `petit-monde.html` predates this and models a different,
simplified machine (display-time glass, derived twin loop, global knobs); it is
kept as a reference artifact.
