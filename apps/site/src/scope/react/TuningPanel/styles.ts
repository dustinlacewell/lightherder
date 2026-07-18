export const TUNING_CSS = `
.hero-tuning {
  position: fixed; top: 12px; right: 12px;
  width: 380px; max-height: calc(100vh - 24px);
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
.hero-tuning button {
  background: rgba(255,255,255,0.06); color: #d8d8e0;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 3px; padding: 2px 8px;
  font: inherit; cursor: pointer;
}
.hero-tuning button:hover:not(:disabled) { background: rgba(255,255,255,0.12); }
.hero-tuning button:disabled { opacity: 0.4; cursor: not-allowed; }

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

.hero-tuning [data-dials-panel] {
  display: flex; flex-direction: column; gap: 4px;
}
.hero-tuning [data-dials-slot] {
  display: flex; flex-direction: column; gap: 2px;
}
.hero-tuning .dials-slot-header {
  display: flex; align-items: center; gap: 4px;
}
.hero-tuning .dials-slot-label { flex: 1; opacity: 0.8; }
.hero-tuning .dials-attach, .hero-tuning .dials-detach {
  font-size: 10px; padding: 0 4px;
}
.hero-tuning [data-dials-number] {
  display: grid; grid-template-columns: 1fr 60px; gap: 4px; align-items: center;
}
.hero-tuning [data-dials-number] input[type=range] { width: 100%; }
.hero-tuning [data-dials-number] input[type=number] {
  background: rgba(0,0,0,0.4); color: #d8d8e0;
  border: 1px solid rgba(255,255,255,0.08); border-radius: 2px;
  padding: 1px 2px; font: inherit; width: 100%;
}
.hero-tuning [data-dials-source] {
  margin-left: 8px; padding: 4px 6px;
  border-left: 2px solid rgba(120, 200, 255, 0.4);
  background: rgba(120, 200, 255, 0.04);
  margin-top: 2px;
}

.hero-tuning [data-dials-help] {
  display: inline-flex; align-items: center; justify-content: center;
  width: 14px; height: 14px;
  border-radius: 50%;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.16);
  color: #d8d8e0;
  font-size: 9px; font-weight: 700;
  cursor: help;
  position: relative;
  user-select: none;
}
.hero-tuning [data-dials-help]:hover,
.hero-tuning [data-dials-help]:focus {
  background: rgba(120, 200, 255, 0.22);
  outline: none;
}
.hero-tuning [data-dials-help-popover] {
  display: none;
  position: absolute;
  top: 100%; right: 0;
  margin-top: 4px;
  z-index: 10;
  width: 260px;
  padding: 8px 10px;
  background: #1a1a22;
  border: 1px solid #3a3a44;
  border-radius: 4px;
  color: #d8d8e0;
  font: 11px/1.45 ui-sans-serif, system-ui, sans-serif;
  font-weight: 400;
  white-space: normal;
  text-align: left;
  cursor: default;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
}
.hero-tuning [data-dials-help-popover] strong {
  display: block; margin-bottom: 4px;
  color: rgba(120, 200, 255, 1);
  font-weight: 600;
}
.hero-tuning [data-dials-help]:hover [data-dials-help-popover],
.hero-tuning [data-dials-help]:focus [data-dials-help-popover] {
  display: block;
}
`
