export const TUNING_CSS = `
.hero-tuning {
  position: fixed; top: 12px; right: 12px;
  width: 440px; max-height: calc(100vh - 24px);
  overflow: visible;
  background: rgba(15, 15, 20, 0.95);
  color: #d8d8e0;
  font: 11px/1.4 ui-sans-serif, system-ui, sans-serif;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 6px;
  padding: 8px;
  z-index: 1000;
  user-select: none;
  pointer-events: auto;
  transition: transform 180ms ease;
  display: flex;
  flex-direction: column;
}
.hero-tuning-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}
.hero-tuning.is-closed {
  transform: translateX(calc(100% + 12px));
}

.hero-tuning button.hero-tuning-toggle {
  position: absolute;
  top: 0;
  right: 100%;
  width: 28px; height: 28px;
  background: #1a1a22;
  color: #d8d8e0;
  font: 14px/1 ui-sans-serif, system-ui, sans-serif;
  border: 1px solid #3a3a44;
  border-right: none;
  border-radius: 4px 0 0 4px;
  cursor: pointer;
  user-select: none;
  padding: 0;
}
.hero-tuning button.hero-tuning-toggle:hover:not(:disabled) { background: #2a2a32; }
/* Overlay-owned controls only — the dial panels inside bring their own
   phosphor chrome and must not inherit these. */
.hero-tab,
.hero-actions button,
.hero-bottom button {
  background: rgba(255,255,255,0.06); color: #d8d8e0;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 3px; padding: 2px 8px;
  font: inherit; cursor: pointer;
}
.hero-tab:hover:not(:disabled),
.hero-actions button:hover:not(:disabled),
.hero-bottom button:hover:not(:disabled) { background: rgba(255,255,255,0.12); }
.hero-tab:disabled,
.hero-actions button:disabled,
.hero-bottom button:disabled { opacity: 0.4; cursor: not-allowed; }

.hero-tabs {
  display: flex; flex-wrap: wrap; gap: 2px;
  margin: 6px 0;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  padding-bottom: 2px;
}
.hero-tab {
  padding: 3px 10px;
  border-radius: 3px 3px 0 0;
  border-bottom-color: transparent;
}
.hero-tab.is-active {
  background: rgba(120, 200, 255, 0.22);
  border-color: rgba(120,200,255,0.4);
}
.hero-tab.is-add {
  background: rgba(120, 255, 180, 0.12);
}

.hero-actions { display: flex; gap: 4px; margin: 4px 0; }
.hero-actions button { flex: 1; }

.hero-body { padding: 4px 2px 0; }
.hero-empty {
  padding: 12px; opacity: 0.6; text-align: center;
  font-style: italic;
}

.hero-bottom { display: flex; gap: 6px; margin-top: 10px; }
.hero-bottom button { flex: 1; padding: 6px 8px; }
`
