/* The action catalog — every user-facing command and gesture the bench
   answers to, as one declarative list. Today it feeds a single reader:
   the keybind reference overlay. It is SHAPED for more — a key-action
   carries a rebindable chord and (eventually) a handler; a gesture
   carries the pointer motion a primitive hardcodes — so a Keybinds tab
   that rebinds the chords and a global key dispatcher can grow onto the
   same source of truth without reshaping it.

   The split that keeps the layers honest: a `key` binding is the app's
   to own and (later) remap; a `gesture` binding is DESCRIPTIVE — it
   documents what phosphor's Knob/Slider primitives own at the pointer
   level, so the reference can show it without the app reaching into the
   primitive to seize its gesture policy. Gestures are listed, never
   rebound. */

export type ActionCategory = 'Transport' | 'Editing' | 'Navigation' | 'Knob';

/** a keyboard chord — the rebindable kind. `key` matches KeyboardEvent
    .key (case-insensitive for letters); modifiers default false. */
export interface KeyChord {
  kind: 'key';
  key: string;
  shift?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  meta?: boolean;
}

/** a pointer gesture a primitive owns — descriptive only, never
    rebound. `motion` is the canonical phrase the reference renders. */
export interface Gesture {
  kind: 'gesture';
  motion:
    | 'left-drag'
    | 'right-drag'
    | 'shift+right-drag'
    | 'right-click'
    | 'double-click'
    | 'wheel'
    | 'middle-click';
}

export type Binding = KeyChord | Gesture;

export interface Action {
  id: string;
  label: string;
  description: string;
  category: ActionCategory;
  binding: Binding;
  /** true where a modifier finetunes the gesture/nudge (Shift = fine) */
  fineWithShift?: boolean;
}

const key = (k: string, mods: Omit<KeyChord, 'kind' | 'key'> = {}): KeyChord =>
  ({ kind: 'key', key: k, ...mods });
const gesture = (motion: Gesture['motion']): Gesture => ({ kind: 'gesture', motion });

/* The catalog. Ordered within category as a user would learn them.
   `binding` reflects what the code actually does TODAY — the reference
   is a mirror, so it must never claim a binding the app doesn't honor.
   When a real binding changes, change it here in the same edit. */
export const ACTIONS: readonly Action[] = [
  // ── Transport (global; see chrome/Transport.tsx) ──────────────────
  { id: 'transport.step', label: 'Step one frame', category: 'Transport', binding: key('.'),
    description: 'Advance exactly one video frame — one hop of light through every device. Freezes the loop first if it is running.' },
  { id: 'transport.freeze', label: 'Freeze', category: 'Transport', binding: key('f'),
    description: 'Hold every loop still. Press again to resume. Ignored while typing in a field or over a knob.' },
  { id: 'transport.clear', label: 'Clear screens', category: 'Transport', binding: key('c'),
    description: 'Blank every screen. Ignored while typing in a field or over a knob.' },

  // ── Editing (React Flow canvas + clipboard) ───────────────────────
  { id: 'edit.delete', label: 'Delete selection', category: 'Editing', binding: key('Delete'),
    description: 'Remove the selected node(s) or edge(s). Backspace does the same. Disabled for read-only session viewers.' },
  { id: 'edit.select', label: 'Box select', category: 'Editing', binding: gesture('left-drag'),
    description: 'Drag on empty bench to rubber-band a selection (Ctrl+drag also works). Panning moved to the middle button to make room.' },
  { id: 'edit.pan', label: 'Pan the bench', category: 'Editing', binding: gesture('middle-click'),
    description: 'Drag with the middle button to pan the view.' },
  { id: 'edit.ping', label: 'Ping the bench', category: 'Editing', binding: gesture('middle-click'),
    description: 'Middle-click (no drag) anywhere to drop a "look here" ping — a marker every peer in the room sees.' },
  { id: 'edit.copy', label: 'Copy selection', category: 'Editing', binding: key('c', { ctrl: true }),
    description: 'Copy the selected node(s), and any wires between them, to the clipboard.' },
  { id: 'edit.paste', label: 'Paste', category: 'Editing', binding: key('v', { ctrl: true }),
    description: 'Paste the copied node(s) back onto the bench, offset from their original spot, with their internal wires reconnected and fresh ids.' },
  { id: 'edit.selectAll', label: 'Select all', category: 'Editing', binding: key('a', { ctrl: true }),
    description: 'Select every node on the viewed level.' },

  // ── Navigation ────────────────────────────────────────────────────
  { id: 'nav.drill', label: 'Drill into module', category: 'Navigation', binding: gesture('double-click'),
    description: 'Double-click a module node (or its ⤢ button) to enter its subgraph. Use the breadcrumb to climb back out.' },

  // ── Knob & slider gestures (phosphor primitives; descriptive) ─────
  { id: 'knob.value', label: 'Set value', category: 'Knob', binding: gesture('left-drag'), fineWithShift: true,
    description: 'Left-drag a knob vertically to set its value; 150px spans the full range. Hold Shift for a fine (0.15×) drag. On a modulated knob this slides the whole envelope with the base value.' },
  { id: 'knob.depth', label: 'Set modulation width', category: 'Knob', binding: gesture('right-drag'), fineWithShift: true,
    description: 'Right-drag a knob vertically to set how far an attached source swings it — the white envelope band. Works before a source is attached (pre-arming). Hold Shift for a fine drag.' },
  { id: 'knob.glide', label: 'Set glide', category: 'Knob', binding: gesture('shift+right-drag'),
    description: 'Shift + right-drag a knob to set its glide — the seconds a signal takes to chase the knob. Only on knobs that offer glide (a Dial node’s value); shown as the bar under the face.' },
  { id: 'knob.picker', label: 'Open source picker', category: 'Knob', binding: gesture('right-click'),
    description: 'Right-click (tap, without dragging) a modulatable knob to open its attach-source picker — the grid of waveform sources.' },
  { id: 'knob.reset', label: 'Reset to default', category: 'Knob', binding: gesture('double-click'),
    description: 'Double-click a knob to return it to its home value. Inside a module instance, home is the library definition’s current value; elsewhere it is the parameter’s factory default.' },
  { id: 'knob.nudge', label: 'Nudge value', category: 'Knob', binding: gesture('wheel'), fineWithShift: true,
    description: 'Scroll over a knob to nudge its value; Shift scrolls finer. Arrow keys do the same when the knob is focused, with Home resetting to default.' },
  { id: 'knob.midi', label: 'MIDI learn / unbind', category: 'Knob', binding: gesture('right-click'),
    description: 'With a MIDI controller connected, right-click a knob to learn a CC (move a control to bind it) or unbind the current one.' },
] as const;

/** the catalog grouped by category, in the category order below —
    the order the reference renders sections. */
export const ACTION_CATEGORIES: readonly ActionCategory[] = [
  'Transport', 'Editing', 'Navigation', 'Knob',
];

export function actionsByCategory(): { category: ActionCategory; actions: Action[] }[] {
  return ACTION_CATEGORIES.map(category => ({
    category,
    actions: ACTIONS.filter(a => a.category === category),
  })).filter(g => g.actions.length > 0);
}

/** render a binding as the short chip the reference shows in its key
    column — 'F', 'Shift+RightDrag', 'Wheel', etc. */
export function bindingLabel(b: Binding): string {
  if (b.kind === 'key') {
    const mods = [b.ctrl && 'Ctrl', b.alt && 'Alt', b.shift && 'Shift', b.meta && 'Meta'].filter(Boolean);
    const k = b.key === ' ' ? 'Space' : b.key.length === 1 ? b.key.toUpperCase() : b.key;
    return [...mods, k].join('+');
  }
  const MOTION: Record<Gesture['motion'], string> = {
    'left-drag': 'Drag',
    'right-drag': 'Right-drag',
    'shift+right-drag': 'Shift+Right-drag',
    'right-click': 'Right-click',
    'double-click': 'Double-click',
    'wheel': 'Scroll',
    'middle-click': 'Middle-click',
  };
  return MOTION[b.motion];
}
