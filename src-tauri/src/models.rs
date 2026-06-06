// ═══════════════════════════════════════════════════════════════════
// Shared data structures and utility functions
// ═══════════════════════════════════════════════════════════════════

use std::path::PathBuf;

use serde::Serialize;

const UNITS: &[&str] = &["B", "K", "M", "G", "T", "P", "E"];

pub fn human_size(bytes: u64) -> String {
    if bytes < 1024 {
        return format!("{} B", bytes);
    }
    let size = bytes as f64;
    let idx = ((size.log2() / 10.0) as usize).min(UNITS.len() - 1);
    format!("{:.1} {}", size / (1024u64.pow(idx as u32) as f64), UNITS[idx])
}

pub fn strip_extended_prefix(path: PathBuf) -> PathBuf {
    let s = path.to_string_lossy();
    if let Some(stripped) = s.strip_prefix(r"\\?\") {
        PathBuf::from(stripped)
    } else {
        path
    }
}

pub fn is_hidden(name: &std::ffi::OsStr) -> bool {
    name.to_str().map(|s| s.starts_with('.')).unwrap_or(false)
}

// ── Data structures ────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub size_human: String,
    pub is_dir: bool,
    pub child_count: u64,
    pub children: Vec<DirEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub root_name: String,
    pub root_path: String,
    pub total_size: u64,
    pub total_size_human: String,
    pub file_count: u64,
    pub dir_count: u64,
    pub children: Vec<DirEntry>,
    pub elapsed_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressPayload {
    pub files: u64,
    pub bytes: u64,
    pub bytes_human: String,
}

#[derive(Debug, Clone)]
pub struct Entry {
    pub path: PathBuf,
    pub size: u64,
    pub depth: u32,
    pub is_dir: bool,
}
