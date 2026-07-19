/* The bench's drag-and-drop protocol — what the toolbar and the
   library shelf write onto a drag, and what the bench's drop
   handler reads back. */

/** a new device from the toolbar: "<kind>|<momentary 0/1>" */
export const DND_MIME = 'application/x-herder';

/** a library entry to place as a module: the entry's id */
export const LIB_MIME = 'application/x-herder-lib';

/* the browser's default drag image is a snapshot of the dragged button —
   we suppress it, because the bench renders the REAL thing instead: the
   presence spawn ghost (the device chassis at the drop anchor), for the
   local dragger and the peers alike */
const blank = typeof Image !== 'undefined' ? new Image() : null;
if (blank) blank.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAAIBRAA7';

/** call inside onDragStart to hide the native drag snapshot */
export function hideDragImage(e: React.DragEvent): void {
  if (blank) e.dataTransfer.setDragImage(blank, 0, 0);
}
