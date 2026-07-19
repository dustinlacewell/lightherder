/* The session panel — the right-hand pane for hosting or joining a live
   room, toggled from the util strip exactly like the MIDI log. It only
   reflects the session store and drives the public session surface; the
   handshake and the wire live under session/.

   Contents (PLAN §F): Create (a minted room code with a copy-link), a
   Join input, a phase dot, the peer roster (ids truncated — peers are
   unnamed in v1), and Leave. The write toggles (host) and the follow-pin
   toggle (peer) appear but are disabled until S5/S6 wire them. */

import { useState, useSyncExternalStore } from 'react';
import {
  createSession, joinSession, leaveSession, peerColor, requestResync,
  setFollow, setWrite, syncAllPeers, sessionStore, type SessionDeps,
} from '../../session';

/* a short, stable tag for an unnamed peer — the id truncated */
const shortId = (id: string): string => id.slice(0, 6);

/* the copy-link a joiner pastes: this page's URL with the room in the
   hash, so opening it auto-joins (the Bench mount effect parses it) */
const roomLink = (code: string): string =>
  location.origin + location.pathname + '#room=' + code;

const PHASE_TITLE: Record<string, string> = {
  idle: 'no session',
  joining: 'joining — waiting for the host',
  live: 'live',
  ended: 'session ended',
};

export function SessionPanel({ deps, onClose }: { deps: SessionDeps; onClose: () => void }) {
  useSyncExternalStore(sessionStore.subscribe, sessionStore.version);
  const s = sessionStore.state();
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);

  const inSession = s.phase !== 'idle';
  const isHost = s.role === 'host';

  const copyLink = (): void => {
    if (!s.code) return;
    void navigator.clipboard.writeText(roomLink(s.code)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 900);
    });
  };

  return (
    <aside className="session-panel">
      <header className="session-head">
        <span className="dev-name">Session</span>
        <button className="dev-btn nodrag" title="Close" onClick={onClose}>×</button>
      </header>

      <div className="session-body">
        {!inSession && (
          <div className="session-actions">
            <button className="session-btn" title="Host a new room" onClick={() => void createSession(deps)}>Create room</button>
            <div className="session-join">
              <input
                className="session-input"
                placeholder="room code…"
                value={joinCode}
                spellCheck={false}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter' && joinCode.trim()) void joinSession(joinCode.trim(), deps); }}
              />
              <button
                className="session-btn"
                disabled={!joinCode.trim()}
                onClick={() => void joinSession(joinCode.trim(), deps)}
              >Join</button>
            </div>
          </div>
        )}

        {inSession && (
          <>
            <div className="session-status">
              <span className={`session-dot session-dot-${s.phase}`} title={PHASE_TITLE[s.phase]} />
              <span className="session-phase">{PHASE_TITLE[s.phase]}</span>
              {isHost && <span className="session-role">host</span>}
            </div>

            {s.code && (
              <div className="session-code" title="Share this code, or the copy-link, to invite">
                <span className="session-code-val">{s.code}</span>
                <button className="dev-btn nodrag" title="Copy the invite link" onClick={copyLink}>{copied ? '✓' : '⧉'}</button>
              </div>
            )}

            {s.phase === 'joining' && s.progress && (
              <div className="session-progress" title="Receiving the host's media">
                <div className="session-progress-bar" style={{ width: `${s.progress.pct}%` }} />
                <span className="session-progress-label">receiving media {s.progress.key}</span>
              </div>
            )}

            {s.phase === 'joining' && s.relayNote && (
              <div className="session-relaynote" title="Signaling-relay health — a host claim travels through these. 0 connected while stuck means the relay pool, not the room, is the problem.">
                {s.relayNote}
              </div>
            )}

            {s.phase === 'ended' && (
              <div className="session-note">
                {s.peers.length ? 'the host left' : 'no host in this room'} — Leave to restore your bench
              </div>
            )}

            <div className="session-peers">
              {s.peers.length === 0 && <div className="session-empty">no peers yet</div>}
              {s.peers.map(p => (
                <div key={p.id} className="session-peer">
                  {/* the peer's presence color — the same hue its cursor wears on the bench */}
                  <span className="session-peer-dot" style={{ background: peerColor(p.id) }} />
                  <span className="session-peer-id">{shortId(p.id)}{p.id === s.selfId ? ' (you)' : ''}</span>
                  {isHost && p.id !== s.selfId && (
                    <button
                      className={`session-write${p.write ? ' on' : ''}`}
                      title={p.write ? 'Revoke write access' : 'Grant write access'}
                      onClick={() => setWrite(p.id, !p.write)}
                    >{p.write ? 'write' : 'read'}</button>
                  )}
                  {!isHost && p.id === s.selfId && (
                    <span className="session-badge">{s.write ? 'write' : 'read'}</span>
                  )}
                </div>
              ))}
            </div>

            {!isHost && (
              <label className="session-follow" title="Ride the host's view — camera, level and preview monitor follow the host. Pan or zoom to break away.">
                <input type="checkbox" checked={s.follow} onChange={e => setFollow(e.target.checked)} />
                <span>Follow host</span>
              </label>
            )}

            {s.phase === 'live' && isHost && s.peers.length > 1 && (
              <button
                className="session-btn"
                title="Send everyone a fresh copy of the whole document"
                onClick={() => syncAllPeers()}
              >Sync all</button>
            )}
            {s.phase === 'live' && !isHost && (
              <button
                className="session-btn"
                title="Fetch a fresh copy of the host's document"
                onClick={() => requestResync()}
              >Sync</button>
            )}

            <button className="session-btn session-leave" onClick={() => void leaveSession()}>Leave</button>
          </>
        )}
      </div>
    </aside>
  );
}
