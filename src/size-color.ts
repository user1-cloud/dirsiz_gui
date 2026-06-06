// ═══════════════════════════════════════════════════════════════════
// Size color — Synthwave gradient
// ═══════════════════════════════════════════════════════════════════

import type { SizeColor } from "./types";

export function sizeColor(ratio: number): SizeColor {
  if (ratio < 0.03) return { color: '#3a4470', glow: 'none' };
  if (ratio < 0.08) return { color: '#00ccbb', glow: '0 0 4px #00ccbb33' };
  if (ratio < 0.20) return { color: '#00e5ff', glow: '0 0 5px #00e5ff44' };
  if (ratio < 0.40) return { color: '#ffb627', glow: '0 0 6px #ffb62744' };
  if (ratio < 0.65) return { color: '#ff6b3d', glow: '0 0 8px #ff6b3d55' };
  return { color: '#ff2d78', glow: '0 0 10px #ff2d7866' };
}

export function applySizeColor(el: HTMLElement, entrySize: number, parentSize: number): void {
  if (!parentSize || parentSize === 0) return;
  const { color, glow } = sizeColor(entrySize / parentSize);
  el.style.color = color;
  el.style.textShadow = glow;
}
