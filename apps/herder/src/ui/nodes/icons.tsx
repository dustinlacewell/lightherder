/* One glyph per device kind, so a glance tells a camera from a TV. */

import type { NodeKind } from '../../patch';

export function KindIcon({ kind }: { kind: NodeKind }) {
  const common = { className: `dev-ico ico-${kind}`, viewBox: '0 0 14 14', fill: 'none', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  switch (kind) {
    case 'camera': return (
      <svg {...common}>
        <rect x="1" y="4" width="7.5" height="6" rx="1.5" />
        <path d="M8.5 6.3 L12.9 4.2 V9.8 L8.5 7.7 Z" />
      </svg>
    );
    case 'monitor': return (
      <svg {...common}>
        <path d="M4.5 1.2 L7 4 L9.5 1.2" />
        <rect x="1.2" y="4" width="11.6" height="8" rx="1.2" />
      </svg>
    );
    case 'mixer': return (
      <svg {...common}>
        <path d="M1 3.5 H4 L8 7 H12.6" />
        <path d="M1 10.5 H4 L8 7" />
        <path d="M11 5.4 L12.8 7 L11 8.6" />
      </svg>
    );
    case 'switch': return (
      <svg {...common}>
        <circle cx="2.4" cy="3" r="1.1" />
        <circle cx="2.4" cy="7" r="1.1" />
        <circle cx="2.4" cy="11" r="1.1" />
        <path d="M3.6 3 L9.2 7 H11" />
        <circle cx="12" cy="7" r="1.1" fill="currentColor" />
      </svg>
    );
    case 'dial': return (
      <svg {...common}>
        <circle cx="7" cy="7.4" r="5.2" />
        <path d="M7 7.4 L3.9 4.6" />
      </svg>
    );
    case 'xypad': return (
      <svg {...common}>
        <rect x="1.5" y="1.5" width="11" height="11" rx="1.2" />
        <circle cx="8.6" cy="4.6" r="1.3" fill="currentColor" />
      </svg>
    );
    case 'media': return (
      <svg {...common}>
        <rect x="1.2" y="2.2" width="11.6" height="9.6" rx="1.2" />
        <circle cx="4.4" cy="5.4" r="1.15" />
        <path d="M2 10.6 L5.6 7.2 L8 9.4 L10 6.6 L12 8.6" />
      </svg>
    );
    case 'draw': return (
      <svg {...common}>
        <path d="M9.6 2 L12 4.4 L5 11.4 L2 12 L2.6 9 Z" />
        <path d="M8.2 3.4 L10.6 5.8" />
      </svg>
    );
    case 'in': return (
      <svg {...common}>
        <path d="M1 7 H7.5 M5 4.2 L7.8 7 L5 9.8" />
        <path d="M10 2.5 H12.5 V11.5 H10" />
      </svg>
    );
    case 'out': return (
      <svg {...common}>
        <path d="M4 2.5 H1.5 V11.5 H4" />
        <path d="M6.5 7 H13 M10.5 4.2 L13.3 7 L10.5 9.8" />
      </svg>
    );
    case 'module': return (
      <svg {...common}>
        <rect x="1.5" y="1.5" width="11" height="11" rx="1.5" />
        <rect x="4.4" y="4.4" width="5.2" height="5.2" rx="1" />
      </svg>
    );
  }
}
