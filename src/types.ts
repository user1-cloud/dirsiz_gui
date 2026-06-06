// ═══════════════════════════════════════════════════════════════════
// Shared types — mirrors Rust structs in commands.rs
// ═══════════════════════════════════════════════════════════════════

export interface DirEntry {
  name: string;
  path: string;
  size: number;
  sizeHuman: string;
  isDir: boolean;
  childCount: number;
  children: DirEntry[];
}

export interface ScanResult {
  rootName: string;
  rootPath: string;
  totalSize: number;
  totalSizeHuman: string;
  fileCount: number;
  dirCount: number;
  children: DirEntry[];
  elapsedMs: number;
}

export interface ProgressPayload {
  files: number;
  bytes: number;
  bytesHuman: string;
}

export type ScanPhase = 'building' | 'mft' | 'walk' | 'walk-fallback';

export type AppState = 'idle' | 'scanning' | 'building' | 'done' | 'error';

export interface DomNodeInfo {
  wrapper: HTMLElement;
  childrenContainer: HTMLElement | null;
  hasChildren: boolean;
  depth: number;
}

export interface SizeColor {
  color: string;
  glow: string;
}
