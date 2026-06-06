// ═══════════════════════════════════════════════════════════════════
// Inline tooltip (appears below hovered tree row)
// ═══════════════════════════════════════════════════════════════════

let activeTooltip: HTMLElement | null = null;

export function showTooltip(text: string, row: HTMLElement): void {
  hideTooltip();
  const tip = document.createElement("div");
  tip.className = "node-tooltip-inline";
  tip.textContent = text;
  row.insertAdjacentElement("afterend", tip);
  activeTooltip = tip;
}

export function hideTooltip(): void {
  if (activeTooltip) {
    activeTooltip.remove();
    activeTooltip = null;
  }
}
