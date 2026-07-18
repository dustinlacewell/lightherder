import { useEffect, type ReactNode } from 'react'

interface ModalProps {
  /** When false, renders nothing. */
  open: boolean
  /** Called when the user dismisses the modal (Escape or backdrop click). */
  onClose: () => void
  /**
   * The dialog content. Almost always an `Display` — the modal is
   * deliberately "the OLED is the dialog," no separate dialog chrome.
   */
  children: ReactNode
  /**
   * Whether clicking the backdrop dismisses the modal. Defaults to
   * true. Set false for confirmation flows where the user must use
   * an explicit on-glass control.
   */
  dismissOnBackdrop?: boolean
  /**
   * Whether pressing Escape dismisses the modal. Defaults to true.
   */
  dismissOnEscape?: boolean
  /**
   * Optional class on the centered frame wrapper. Use to override the
   * default `min(560px, calc(100vw - 48px))` width.
   */
  frameClassName?: string
  /** Optional aria-label for the dialog. */
  ariaLabel?: string
}

/**
 * A full-viewport modal. Dims the page, centers a single child
 * (typically an `Display`), and wires up the dismissal affordances
 * users expect from any overlay (Escape + backdrop click).
 *
 * The modal owns NO chrome of its own: no header bar, no close
 * button, no border. The Display inside IS the dialog. If you need a
 * close affordance, put a `ChipToggle` on the Screen, or a
 * `PushButton` on a surrounding Panel.
 *
 * Mounts/unmounts on toggle so the fade-in plays on every open;
 * closes are instantaneous (no exit animation) which matches the
 * rest of the chrome family.
 */
export function Modal({
  open,
  onClose,
  children,
  dismissOnBackdrop = true,
  dismissOnEscape = true,
  frameClassName = '',
  ariaLabel,
}: ModalProps) {
  useEffect(() => {
    if (!open || !dismissOnEscape) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, dismissOnEscape, onClose])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      className="chrome-modal-backdrop"
      onClick={dismissOnBackdrop ? onClose : undefined}
    >
      <div
        className={`chrome-modal-frame ${frameClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
