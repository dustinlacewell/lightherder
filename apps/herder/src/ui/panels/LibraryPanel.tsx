/* The patch library — the right-hand shelf. Entries live in the live
   libStore; this panel only lists, names, renames, drags and deletes
   them. Dragging an entry onto the bench spawns a MODULE instance. Births,
   renames and deaths route through the dispatcher as ops, so the store,
   the shelf and (later) the collab wire stay in step. */

import { useState, useSyncExternalStore } from 'react';
import { instancePrefixes, type SubPatch } from '../../patch';
import { dispatch } from '../../runtime';
import { libStore } from '../../persist';
import { announcePresence } from '../../session';
import { hideDragImage, LIB_MIME } from '../bench/dnd';
import { KindIcon } from '../nodes';

export function LibraryPanel({ onSaveHere, onOpen, root }: {
  onSaveHere: (name: string) => Promise<void>;
  /** enter the entry for modification — the bench's shelf drill */
  onOpen: (id: string) => void;
  root: () => SubPatch;
}) {
  /* re-render whenever an entry is born, renamed or deleted anywhere */
  useSyncExternalStore(libStore.subscribe, libStore.version);
  const entries = libStore.entries();
  const [naming, setNaming] = useState(false);
  /* which entry's name is being edited inline (double-click to open) */
  const [renaming, setRenaming] = useState<string | null>(null);

  /* deleting an entry orphans every instance of it — warn with the count
     on THIS bench (other benches may reference it too, so the wording
     stays general). A zero count skips the confirm — nothing goes dark. */
  const remove = (id: string, name: string): void => {
    const count = instancePrefixes(root(), libStore.resolve, id).length;
    if (count > 0 && !confirm(
      `${count} module instance${count === 1 ? '' : 's'} on this bench use ‘${name}’. ` +
      `They will go dark until an entry with this patch returns.`)) return;
    /* the entry's stored media is dropped in the applier's entryDelete
       branch (beside the release sweeps), so a REMOTE delete drops it too
       and a read-only peer's delete is gated before anything is dropped. */
    dispatch({ kind: 'entryDelete', id });
  };

  const rename = (id: string, value: string): void => {
    const v = value.trim();
    if (v) dispatch({ kind: 'entryRename', id, name: v });
    setRenaming(null);
  };

  return (
    <aside className="library" aria-label="Patch library">
      <header className="lib-head">
        <span className="lib-title">Library</span>
        <button
          className="dev-btn"
          title="Save the patch you're looking at (this level of the bench) to the library"
          onClick={() => setNaming(true)}
        >＋</button>
      </header>
      {naming && (
        <input
          className="lib-name-input"
          autoFocus
          placeholder="patch name…"
          onBlur={() => setNaming(false)}
          onKeyDown={e => {
            if (e.key === 'Escape') setNaming(false);
            else if (e.key === 'Enter') {
              const v = e.currentTarget.value.trim();
              if (v) { void onSaveHere(v); setNaming(false); }
            }
          }}
        />
      )}
      <div className="lib-list">
        {!entries.length && !naming && (
          <div className="lib-empty">nothing on the shelf — build a patch with IN / OUT devices and save it</div>
        )}
        {entries.map(en => (
          <div
            key={en.id}
            className="lib-entry"
            draggable={renaming !== en.id}
            title="drag onto the bench to place this patch as a module · double-click to open it for editing"
            onDoubleClick={() => { if (renaming !== en.id) onOpen(en.id); }}
            /* same in-flight chassis ghost a toolbar drag wears */
            onDragStart={e => {
              e.dataTransfer.setData(LIB_MIME, en.id);
              hideDragImage(e);
              announcePresence({ spawn: { kind: 'module', label: en.name, ref: en.id } });
            }}
            onDragEnd={() => announcePresence({ spawn: undefined })}
          >
            <KindIcon kind="module" />
            {renaming === en.id ? (
              <input
                className="lib-rename-input"
                autoFocus
                defaultValue={en.name}
                onBlur={e => rename(en.id, e.currentTarget.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') setRenaming(null);
                  else if (e.key === 'Enter') rename(en.id, e.currentTarget.value);
                }}
              />
            ) : (
              <span
                className="lib-entry-name"
                title="double-click to rename this entry (instances keep their own names)"
                onDoubleClick={e => { e.stopPropagation(); setRenaming(en.id); }}
              >{en.name}</span>
            )}
            <button
              className="dev-btn"
              title="Delete this entry (instances on the bench go dark until it returns)"
              onClick={() => remove(en.id, en.name)}
            >×</button>
          </div>
        ))}
      </div>
    </aside>
  );
}
