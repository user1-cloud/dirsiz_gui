// ═══════════════════════════════════════════════════════════════════
// App state machine
// ═══════════════════════════════════════════════════════════════════

import type { AppState } from "./types";
import { t } from "./i18n";

export type { AppState };

export interface StateElements {
  footerText: HTMLElement;
  footerBlink: HTMLElement;
  onDone?: () => void;  // called when entering done/error (clears progress)
}

export interface StateManager {
  setState(state: AppState): void;
  getState(): AppState;
}

const LABELS: Record<AppState, string> = {
  idle:     "footerReady",
  scanning: "footerScanning",
  building: "footerBuilding",
  done:     "footerAnalyzed",
  error:    "footerError",
};

export function createStateManager(els: StateElements): StateManager {
  let current: AppState = "idle";

  return {
    setState(state: AppState) {
      current = state;
      els.footerText.textContent = t(LABELS[state]);
      els.footerBlink.className = `footer-blink blink-${state}`;
      if (state === "done" || state === "error") {
        els.onDone?.();
      }
    },
    getState(): AppState {
      return current;
    },
  };
}
