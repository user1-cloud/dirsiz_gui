// ═══════════════════════════════════════════════════════════════════
// Walkdir-based directory scanner (cross-platform fallback)
// ═══════════════════════════════════════════════════════════════════

use std::path::Path;
use std::time::{Duration, Instant};

use tauri::Emitter;
use walkdir::WalkDir;

use crate::cancel::CANCEL_GEN;
use crate::models::{is_hidden, human_size, Entry, ProgressPayload};
use std::sync::atomic::Ordering;

pub fn walk_serial(
    root: &Path,
    show_hidden: bool,
    app: &tauri::AppHandle,
    start: Instant,
    gen: u64,
) -> Result<Vec<Entry>, String> {
    let walker = WalkDir::new(root).into_iter().filter_entry(|e| {
        e.depth() == 0 || show_hidden || !is_hidden(e.file_name())
    });

    let mut entries: Vec<Entry> = Vec::with_capacity(200_000);
    let mut files: u64 = 0;
    let mut bytes: u64 = 0;
    let tick = Duration::from_millis(200);
    let mut next_tick = start + tick;

    for entry in walker.filter_map(|e| e.ok()) {
        if entry.depth() > 0 && !show_hidden && is_hidden(entry.file_name()) {
            continue;
        }

        let path = entry.path().to_path_buf();
        let depth = path.components().count() as u32;
        let is_dir = entry.file_type().is_dir();
        let size = if is_dir {
            0
        } else {
            entry.metadata().map(|m| m.len()).unwrap_or(0)
        };

        files += 1;
        bytes += size;
        entries.push(Entry { path, size, depth, is_dir });

        let now = Instant::now();
        if now >= next_tick {
            if CANCEL_GEN.load(Ordering::Relaxed) != gen {
                return Err("CANCELLED".into());
            }
            let _ = app.emit(
                "scan-progress",
                ProgressPayload {
                    files,
                    bytes,
                    bytes_human: human_size(bytes),
                },
            );
            next_tick = now + tick;
        }
    }

    Ok(entries)
}
