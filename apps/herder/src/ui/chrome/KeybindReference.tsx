/* The keybind reference — a read-only overlay listing every command
   and gesture the bench answers to, grouped by category. It reads the
   action catalog (actions/catalog.ts), so it can never drift from a
   binding the app forgot to document: adding an action lists it here.

   Reference-only for now — no rebinding. The modal is scaffolded with
   Tabs (a single Reference tab today) so a Keybinds rebinding tab can
   join it later without reshaping this. */

import { Modal, Display, Tabs } from '@ldlework/phosphor';
import { actionsByCategory, bindingLabel, type Action } from '../../actions/catalog';

function BindingChip({ action }: { action: Action }) {
  const gesture = action.binding.kind === 'gesture';
  return (
    <span className={`kb-chip${gesture ? ' kb-chip-gesture' : ''}`}>
      {bindingLabel(action.binding)}
      {action.fineWithShift && <span className="kb-chip-fine">+Shift fine</span>}
    </span>
  );
}

function ReferenceBody() {
  return (
    <div className="kb-ref">
      <div className="kb-ref-content">
        {actionsByCategory().map(({ category, actions }) => (
          <section key={category} className="kb-section">
            <h3 className="kb-section-title">{category}</h3>
            <ul className="kb-list">
              {actions.map(a => (
                <li key={a.id} className="kb-row">
                  <div className="kb-row-head">
                    <span className="kb-label">{a.label}</span>
                    <BindingChip action={a} />
                  </div>
                  <p className="kb-desc">{a.description}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

/* the single tab today; the array is where a 'keybinds' rebinding tab
   slots in next to 'reference' */
const TABS = [{ key: 'reference', label: 'Reference' }];

export function KeybindReference({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} ariaLabel="Keyboard & gesture reference" frameClassName="kb-modal">
      <Tabs tabs={TABS} active="reference" onSelect={() => {}} />
      <div style={{ height: 12 }} />
      <Display>
        <ReferenceBody />
      </Display>
    </Modal>
  );
}
