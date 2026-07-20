/* Knob-readout formatters, shared by the param tables and the fx
   registry. */

export const RAD = Math.PI / 180;
export const fdeg = (v: number) => (v / RAD).toFixed(0) + '°';
export const fmul = (v: number) => '×' + v.toFixed(3);
export const fpx = (v: number) => v.toFixed(2) + 'px';
export const f4 = (v: number) => v.toFixed(4);
export const f3 = (v: number) => v.toFixed(3);
export const f2 = (v: number) => v.toFixed(2);
export const fsig = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(3);
export const fint = (v: number) => String(Math.round(v));
export const fhz = (v: number) => v.toFixed(0) + '/s';
export const fsec = (v: number) => v.toFixed(2) + 's';
export const sel = (names: string[]) => (v: number) => names[Math.round(v)] ?? names[0];
