/* The source devices — where a picture enters from outside a loop:
   dropped media, a live webcam, and the hand-painted draw surface. */

import { useCallback, useRef, useState } from 'react';
import type { Slot } from '@ldlework/dials';
import { PARAMS } from '../../patch';
import { loadStoredMedia } from '../../persist';
import { dispatch, drawClear, drawCommit, drawStroke, emitEph, engineRef, gateMode, mirror, setFace } from '../../runtime';
import type { DeviceProps } from '../bench/types';
import { Shell, useSetParam, VPort } from './Shell';

/** where a dropped file OR a remote URL lands depends on what this node
    IS, read off the mirror's effective mediaKey (the one place it's
    authoritative — projection never carries it into the view):

    · a ROOT-level node, or a ref-inner node this instance already
      overrode — `mediaKey === id` (the compiled id). The picture lands
      under that id; the engine already reads it there. Nothing else to do.

    · a ref-inner node still on the ENTRY's default — `mediaKey` is the
      entry-default key (`lib.<id>/<rel>`), distinct from the compiled id.
      Two cases split on whether a default blob already exists there:
        — none yet (a node freshly ADDED to the entry this session): this
          load BECOMES the entry's default. Load straight into the default
          key — every sibling instance reads it too (H7).
        — one exists (re-loading onto a pre-existing entry node): this is an
          instance OVERRIDE. Load under the compiled id and markMedia, so
          compile stamps mediaKey = compiledId and only this instance
          follows the new picture.

    Shared by a dropped file and a URL — only the terminal engine call and
    the ephemeron it emits differ, threaded through `put`. */
async function loadInto(id: string, put: (key: string) => Promise<void>): Promise<void> {
  /* a read-only peer must not diverge its own texture: ask the gate BEFORE
     the side effect (the dispatch after it would block or defer anyway —
     this just moves the refusal ahead of the effect, the same shape as the
     paste / saveHere pre-checks). The markMedia op is a representative: the
     gate decides by role, not op kind, and cues the read-only pill on block. */
  if (gateMode({ kind: 'markMedia', scope: { kind: 'doc', path: [] }, node: id, rel: '', on: true }) === 'block') return;
  const key = mirror.nodes.find(n => n.id === id)?.data.mediaKey;
  if (key === undefined || key === id) {
    await put(id);
    return;
  }
  /* ref-inner, not yet overridden: key is the entry-default blob key */
  const hasDefault = (await loadStoredMedia(key)) !== null;
  if (!hasDefault) {
    /* establish the entry default — the shared source under `key` gets
       the picture, so this and every sibling instance show it */
    await put(key);
  } else {
    await put(id);
    dispatch({ kind: 'markMedia', scope: { kind: 'doc', path: [] }, node: id, rel: '', on: true });
  }
}

export function MediaNode({ id, data }: DeviceProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  const faceRef = useCallback((el: HTMLDivElement | null) => setFace(id, el), [id]);
  const load = (f: File | null | undefined): void => {
    if (!f) return;
    void loadInto(id, key =>
      engineRef.current!.loadMedia(key, f)
        .then(() => emitEph({ t: 'media', key, blob: f }))
        .catch(() => { /* refused file — keep the old picture */ }));
  };
  const loadUrl = (): void => {
    const u = url.trim();
    if (!u) return;
    void loadInto(id, key =>
      engineRef.current!.loadMediaUrl(key, u)
        .then(() => emitEph({ t: 'mediaurl', key, url: u }))
        .catch(() => { /* bad url / CORS-blocked — keep the old picture */ }));
    setUrl('');
  };
  return (
    <Shell
      id={id} data={data} kind="media"
      face={
        <div
          ref={faceRef}
          className="face nodrag"
          title="click to pick an image or video · or drop one here"
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); e.stopPropagation(); load(e.dataTransfer.files?.[0]); }}
        />
      }
    >
      <div className="hint">click · or drop media</div>
      <input
        ref={fileRef} type="file" accept="image/*,video/*" style={{ display: 'none' }}
        onChange={e => { load(e.target.files?.[0]); e.target.value = ''; }}
      />
      <input
        className="nodrag media-url" type="text" placeholder="or paste a video URL…"
        value={url} onChange={e => setUrl(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') loadUrl(); }}
        onBlur={loadUrl}
      />
      <VPort dir="out" id="v:out" top={95} desc="this device's picture" />
    </Shell>
  );
}

/* a live camera feed — unlike media, there's nothing to persist or
   share across a library entry (a stream isn't a file, and every peer
   in a session has its own camera), so this node is simple: click
   starts/stops the engine's own WebcamSource, keyed directly off this
   node's compiled id. */
export function WebcamNode({ id, data }: DeviceProps) {
  const [live, setLive] = useState(() => engineRef.current?.webcamLive(id) ?? false);
  const faceRef = useCallback((el: HTMLDivElement | null) => setFace(id, el), [id]);
  const toggle = (): void => {
    if (live) {
      engineRef.current?.stopWebcam(id);
      setLive(false);
      return;
    }
    engineRef.current?.startWebcam(id)
      .then(() => setLive(true))
      .catch(() => { /* denied or no camera — stay off */ });
  };
  return (
    <Shell
      id={id} data={data} kind="webcam"
      face={
        <div
          ref={faceRef}
          className="face nodrag"
          title={live ? 'click to stop the camera' : 'click to start the camera'}
          onClick={toggle}
        />
      }
    >
      <div className="hint">{live ? 'click to stop' : 'click to start the camera'}</div>
      <VPort dir="out" id="v:out" top={95} desc="this device's picture" />
    </Shell>
  );
}

/* the paint surface lives in the engine (DrawSource) exactly like a
   media node's picture; the face here is the same blitted well, but
   its pointer gestures are stroke segments instead of sparks */
export function DrawNode({ id, data }: DeviceProps) {
  const setParam = useSetParam(id);
  const last = useRef<{ x: number; y: number } | null>(null);
  const faceRef = useCallback((el: HTMLDivElement | null) => setFace(id, el), [id]);
  const norm = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  return (
    <Shell
      id={id} data={data} kind="draw"
      headBtns={
        <button
          className="dev-btn nodrag" title="Wipe the canvas black"
          onClick={() => drawClear(id)}
        >⌫</button>
      }
      face={
        <div
          ref={faceRef}
          className="face draw-face nodrag"
          title="draw here — the picture is this device's output"
          onPointerDown={e => {
            e.currentTarget.setPointerCapture(e.pointerId);
            const p = norm(e);
            drawStroke(id, p.x, p.y, p.x, p.y, (data.slots.hue as Slot<number>).dial.value, (data.slots.size as Slot<number>).dial.value);
            last.current = p;
          }}
          onPointerMove={e => {
            const l = last.current;
            if (!l) return;
            const p = norm(e);
            drawStroke(id, l.x, l.y, p.x, p.y, (data.slots.hue as Slot<number>).dial.value, (data.slots.size as Slot<number>).dial.value);
            last.current = p;
          }}
          onPointerUp={() => { last.current = null; drawCommit(id); }}
          onPointerCancel={() => { last.current = null; }}
        />
      }
    >
      <div className="drawrows nodrag" style={{ '--hue': String((data.slots.hue as Slot<number>).dial.value) } as React.CSSProperties}>
        <label className="drow" title={PARAMS.draw.hue.desc}>
          <span>Hue</span>
          <input
            type="range" className="dslider hue-slider" min={0} max={360} step={1}
            value={(data.slots.hue as Slot<number>).dial.value} onChange={e => setParam('hue', Number(e.target.value))}
          />
          <span className="dval">{PARAMS.draw.hue.fmt((data.slots.hue as Slot<number>).dial.value)}</span>
        </label>
        <label className="drow" title={PARAMS.draw.size.desc}>
          <span>Size</span>
          <input
            type="range" className="dslider size-slider" min={1} max={60} step={1}
            value={(data.slots.size as Slot<number>).dial.value} onChange={e => setParam('size', Number(e.target.value))}
          />
          <span className="dval">{PARAMS.draw.size.fmt((data.slots.size as Slot<number>).dial.value)}</span>
        </label>
      </div>
      <VPort dir="out" id="v:out" top={95} desc="the drawing — this device's picture" />
    </Shell>
  );
}
