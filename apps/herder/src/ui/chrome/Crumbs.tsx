/* Top-left: where you are in the patch tree — BENCH is the root;
   each crumb climbs back out of a module. A crumb that entered a
   library MODULE wears a small glyph — the level below it is a shared
   definition, not this instance's own copy. When the level you're
   actually looking at is a library entry, a warning chip spells out the
   sharp part: structure edited here changes every instance of it. */

import { libHead, type Crumb } from '../../patch';

export function Crumbs({ path, onJump }: { path: Crumb[]; onJump: (depth: number) => void }) {
  const last = path[path.length - 1];
  const editingEntry = last?.entry;
  /* a lib-rooted path was entered from the shelf — an extra "Library"
     segment says where the drill stands. It is not a level you can jump
     to (the shelf is a panel, not a place), so it renders inert. */
  const libRooted = path.length > 0 && libHead(path[0].id) !== null;
  return (
    <nav className="crumbs" aria-label="Patch depth">
      <button className="crumb" disabled={!path.length} onClick={() => onJump(0)} title="the top-level bench">BENCH</button>
      {libRooted && (
        <span className="crumb-seg">
          <span className="crumb-sep">▸</span>
          <button className="crumb" disabled title="entered from the library shelf — no instance on the bench">Library</button>
        </span>
      )}
      {path.map((c, i) => (
        <span key={i} className="crumb-seg">
          <span className="crumb-sep">▸</span>
          <button className="crumb" disabled={i === path.length - 1} onClick={() => onJump(i + 1)}>
            {c.entry && <span className="crumb-lib" title="a library module — the level inside is a shared definition">◈</span>}
            {c.name}
          </button>
        </span>
      ))}
      {editingEntry && (
        <span className="crumb-warn" title={`‘${editingEntry.name}’ is a library entry — every instance shares this structure`}>
          edits affect every instance
        </span>
      )}
    </nav>
  );
}
