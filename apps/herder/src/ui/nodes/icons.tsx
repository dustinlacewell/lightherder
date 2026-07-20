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
    case 'wobbulate': return (
      <svg {...common}>
        <rect x="1.2" y="2.5" width="11.6" height="9" rx="1.2" />
        <path d="M3 7 C4.3 4.2, 5.7 4.2, 7 7 C8.3 9.8, 9.7 9.8, 11 7" />
      </svg>
    );
    case 'kaleido': return (
      <svg {...common}>
        <circle cx="7" cy="7" r="5.8" />
        <path d="M7 1.2 V12.8 M2 4.1 L12 9.9 M12 4.1 L2 9.9" />
      </svg>
    );
    case 'polar': return (
      <svg {...common}>
        <circle cx="7" cy="7" r="5.8" />
        <circle cx="7" cy="7" r="2.6" />
        <path d="M7 1.2 V4.4" />
      </svg>
    );
    case 'colorize': return (
      <svg {...common}>
        <rect x="1.4" y="3" width="3.2" height="8" rx="0.8" />
        <rect x="5.4" y="3" width="3.2" height="8" rx="0.8" />
        <rect x="9.4" y="3" width="3.2" height="8" rx="0.8" />
      </svg>
    );
    case 'solarize': return (
      <svg {...common}>
        <circle cx="7" cy="7" r="3.8" />
        <path d="M1.5 12.5 L12.5 1.5" />
      </svg>
    );
    case 'contour': return (
      <svg {...common}>
        <ellipse cx="7" cy="7" rx="5.8" ry="4.6" />
        <ellipse cx="7" cy="7" rx="3.6" ry="2.7" />
        <ellipse cx="7" cy="7" rx="1.5" ry="1" />
      </svg>
    );
    case 'delay': return (
      <svg {...common}>
        <rect x="3.6" y="1.6" width="8.8" height="8.8" rx="1" />
        <rect x="1.6" y="3.6" width="8.8" height="8.8" rx="1" />
      </svg>
    );
    case 'timebase': return (
      <svg {...common}>
        <path d="M1.5 3 H12.5 M2.5 5.5 H11.5 M1 8 H13 M2 10.5 H12" />
      </svg>
    );
    case 'glow': return (
      <svg {...common}>
        <circle cx="7" cy="7" r="2.6" />
        <path d="M7 1.2 V3 M7 11 V12.8 M1.2 7 H3 M11 7 H12.8 M2.9 2.9 L4.2 4.2 M9.8 9.8 L11.1 11.1 M11.1 2.9 L9.8 4.2 M4.2 9.8 L2.9 11.1" />
      </svg>
    );
    case 'polarize': return (
      <svg {...common}>
        <rect x="1.5" y="2.5" width="11" height="9" rx="1.2" />
        <path d="M3.5 11.5 C4.5 7, 6 6.5, 7 9 C8 11.5, 9.5 5, 10.5 2.5" />
      </svg>
    );
    case 'convolve': return (
      <svg {...common}>
        <rect x="1.5" y="1.5" width="11" height="11" rx="1" />
        <path d="M5.2 1.5 V12.5 M8.8 1.5 V12.5 M1.5 5.2 H12.5 M1.5 8.8 H12.5" />
      </svg>
    );
    case 'paint': return (
      <svg {...common}>
        <path d="M2 12.5 C2 9.5, 4 9.5, 4.5 7.5 L9.5 2.5 L11.5 4.5 L6.5 9.5 C4.5 10, 4.5 12, 2 12.5 Z" />
      </svg>
    );
    case 'morph': return (
      <svg {...common}>
        <circle cx="5.5" cy="7" r="4.3" />
        <circle cx="9.5" cy="7" r="2.2" />
      </svg>
    );
    case 'halftone': return (
      <svg {...common}>
        <circle cx="3.5" cy="3.5" r="1.9" /><circle cx="9.5" cy="4" r="1.3" />
        <circle cx="4" cy="9.5" r="1.3" /><circle cx="9.8" cy="9.8" r="0.8" />
      </svg>
    );
    case 'dither': return (
      <svg {...common}>
        <path d="M2 2 H4 M6 2 H8 M10 2 H12 M4 4.5 H6 M8 4.5 H10 M2 7 H4 M6 7 H8 M10 7 H12 M4 9.5 H6 M8 9.5 H10 M2 12 H4 M6 12 H8 M10 12 H12" />
      </svg>
    );
    case 'mosaic': return (
      <svg {...common}>
        <path d="M7 1.5 L11.8 4.2 V9.8 L7 12.5 L2.2 9.8 V4.2 Z M7 1.5 V7 M2.2 9.8 L7 7 L11.8 9.8" />
      </svg>
    );
    case 'droste': return (
      <svg {...common}>
        <rect x="1.5" y="1.5" width="11" height="11" rx="1" />
        <rect x="4" y="4" width="6" height="6" rx="0.8" />
        <rect x="5.8" y="5.8" width="2.4" height="2.4" rx="0.5" />
      </svg>
    );
    case 'conformal': return (
      <svg {...common}>
        <path d="M1.5 7 C1.5 3, 5 1.5, 7 4 C9 6.5, 12.5 5, 12.5 7 C12.5 9, 9 7.5, 7 10 C5 12.5, 1.5 11, 1.5 7 Z" />
      </svg>
    );
    case 'relight': return (
      <svg {...common}>
        <path d="M1.5 11.5 L5 7.5 L8 9.5 L12.5 4.5" />
        <circle cx="10.8" cy="2.8" r="1.4" />
        <path d="M12.5 11.5 H1.5" />
      </svg>
    );
    case 'turbwarp': return (
      <svg {...common}>
        <path d="M2 4 C5 2, 7 6, 10 4 C11.5 3, 12 2.5, 12.3 2" />
        <path d="M2 8 C5 6, 7 10, 10 8 C11.5 7, 12 6.5, 12.3 6" />
        <path d="M2 12 C5 10, 7 14, 10 12" />
      </svg>
    );
    case 'noise': return (
      <svg {...common}>
        <path d="M2.5 9.5 C2.5 6.5, 4.5 6, 5.5 7 C5.5 4.5, 8.5 4, 9 6 C11 5.5, 12 7, 11.5 8.5 C12.5 9.5, 11.5 11, 10 11 H4.5 C3 11, 2.5 10.5, 2.5 9.5 Z" />
      </svg>
    );
    case 'moire': return (
      <svg {...common}>
        <path d="M2 2.5 V11.5 M4.2 2.5 V11.5 M6.4 2.5 V11.5 M8.6 2.5 V11.5 M10.8 2.5 V11.5" />
        <path d="M1.5 4.5 L12.5 8.5" />
      </svg>
    );
    case 'julia': return (
      <svg {...common}>
        <path d="M7 12.5 C3 12.5, 1.5 9, 3.5 7 C1.5 5, 3 1.5, 6 2.5 C6.5 1, 8.5 1, 9 2.5 C12 1.5, 13 5, 11 7 C12.5 9, 11 12.5, 7 12.5 Z" />
        <circle cx="5.5" cy="6" r="0.7" /><circle cx="8.5" cy="6" r="0.7" />
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
    case 'webcam': return (
      <svg {...common}>
        <rect x="0.8" y="3.2" width="8" height="7.6" rx="1.2" />
        <path d="M8.8 5.4 L12.5 3.6 V10.4 L8.8 8.6 Z" />
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
