// ═══════════════════════════════════════════════════════════════════
// Tauri API wrappers — typed, centralized command names
// ═══════════════════════════════════════════════════════════════════

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { DirEntry, ScanResult, ProgressPayload, ScanPhase } from "./types";

export function scanDirectory(path: string, showHidden: boolean, forceWalkdir?: boolean): Promise<ScanResult> {
  return invoke("scan_directory", { path, showHidden, forceWalkdir: forceWalkdir ?? false });
}

export function expandDirectory(path: string, showHidden: boolean): Promise<DirEntry[]> {
  return invoke("expand_directory", { path, showHidden });
}

export function cancelScan(): Promise<void> {
  return invoke("cancel_scan");
}

export function onScanProgress(cb: (payload: ProgressPayload) => void): Promise<UnlistenFn> {
  return listen<ProgressPayload>("scan-progress", (event) => cb(event.payload));
}

export function onScanPhase(cb: (phase: string) => void): Promise<UnlistenFn> {
  return listen<string>("scan-phase", (event) => cb(event.payload));
}
