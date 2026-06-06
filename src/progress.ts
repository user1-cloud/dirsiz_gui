// ═══════════════════════════════════════════════════════════════════
// Progress & phase event listeners from Rust backend
// ═══════════════════════════════════════════════════════════════════

import type { UnlistenFn } from "@tauri-apps/api/event";
import type { ProgressPayload, AppState, ScanPhase } from "./types";
import { onScanProgress, onScanPhase } from "./api";

let unlistenProgress: UnlistenFn | null = null;
let unlistenPhase: UnlistenFn | null = null;

const SCANNER_LABELS: Record<ScanPhase, string> = {
  building: "",
  mft: "MFT",
  walk: "WALK",
  "walk-fallback": "WALK*",
};

let scannerPrefix = "";

export function clearProgress(el: HTMLElement): void {
  el.textContent = "";
}

export async function setupProgressListener(
  progressEl: HTMLElement,
  setAppState: (state: AppState) => void
): Promise<void> {
  let pending: ProgressPayload | null = null;
  let rafId: number | null = null;

  unlistenProgress = await onScanProgress((p) => {
    pending = p;
    if (!rafId) {
      rafId = requestAnimationFrame(() => {
        if (pending) {
          const prefix = scannerPrefix ? `${scannerPrefix}  |  ` : "";
          progressEl.textContent = `${prefix}${pending.files.toLocaleString()} files  |  ${pending.bytesHuman}`;
          pending = null;
        }
        rafId = null;
      });
    }
  });

  unlistenPhase = await onScanPhase((payload) => {
    if (payload === "building") {
      setAppState("building");
    }
    if (payload.startsWith("err:")) {
      scannerPrefix = payload.slice(4).trim();
    } else {
      scannerPrefix = SCANNER_LABELS[payload as ScanPhase] || payload;
    }
  });
}

export function teardownListeners(): void {
  unlistenProgress?.();
  unlistenPhase?.();
  unlistenProgress = null;
  unlistenPhase = null;
}
