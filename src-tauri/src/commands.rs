// ═══════════════════════════════════════════════════════════════════
// Tauri command handlers — thin wrappers around walkdir scanner
// ═══════════════════════════════════════════════════════════════════

use std::path::Path;
use std::time::Instant;

use tauri::Emitter;

use crate::cancel;
use crate::models::*;
use crate::scanner_walk;
use crate::tree;
use crate::tree_cache;

#[tauri::command]
pub async fn scan_directory(
    app: tauri::AppHandle,
    path: String,
    show_hidden: bool,
    _force_walkdir: bool,
) -> Result<ScanResult, String> {
    let start = Instant::now();
    let root = Path::new(&path).to_path_buf();
    let root = root
        .canonicalize()
        .map(strip_extended_prefix)
        .map_err(|e| format!("Cannot access '{}': {}", path, e))?;

    if !root.is_dir() {
        return Err(format!("'{}' is not a directory", root.display()));
    }

    let gen = cancel::current_gen();

    let app2 = app.clone();
    let root2 = root.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let _ = app2.emit("scan-phase", "walk");
        let entries = scanner_walk::walk_serial(&root2, show_hidden, &app2, start, gen)?;

        if entries.is_empty() {
            return Ok(ScanResult::empty(&root2, start));
        }

        let file_count = entries.iter().filter(|e| !e.is_dir).count() as u64;
        let dir_count = entries.iter().filter(|e| e.is_dir).count() as u64;

        let _ = app2.emit("scan-phase", "building");
        let (sizes, tree_map) = tree::propagate_and_build(entries, &root2);

        tree_cache::store(gen, root2.clone(), tree_map.clone());

        let total_size = sizes.get(&root2).copied().unwrap_or(0);
        let children = tree::build_one_level(&tree_map, &root2);

        Ok(ScanResult {
            root_name: root2
                .file_name()
                .unwrap_or(root2.as_os_str())
                .to_string_lossy()
                .into_owned(),
            root_path: root2.to_string_lossy().into_owned(),
            total_size,
            total_size_human: human_size(total_size),
            file_count,
            dir_count,
            children,
            elapsed_ms: start.elapsed().as_millis() as u64,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?;

    result
}

#[tauri::command]
pub async fn expand_directory(
    app: tauri::AppHandle,
    path: String,
    show_hidden: bool,
) -> Result<Vec<DirEntry>, String> {
    let dir = Path::new(&path).to_path_buf();
    let dir = dir
        .canonicalize()
        .map(strip_extended_prefix)
        .map_err(|e| format!("Cannot access '{}': {}", path, e))?;

    if !dir.is_dir() {
        return Err(format!("'{}' is not a directory", dir.display()));
    }

    let gen = cancel::current_gen();
    let dir2 = dir.clone();

    let result = tauri::async_runtime::spawn_blocking(move || {
        if let Some(children) = tree_cache::lookup(gen, &dir2) {
            let mut tree_map: tree::TreeMap = std::collections::HashMap::new();
            tree_map.insert(dir2.clone(), children);
            return Ok(tree::build_one_level(&tree_map, &dir2));
        }

        let start = Instant::now();
        let entries = scanner_walk::walk_serial(&dir2, show_hidden, &app, start, gen)?;

        if entries.is_empty() {
            return Ok(vec![]);
        }

        let _ = app.emit("scan-phase", "building");
        let (_sizes, tree_map) = tree::propagate_and_build(entries, &dir2);
        Ok(tree::build_one_level(&tree_map, &dir2))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?;

    result
}

// ── ScanResult helper ─────────────────────────────────────────────

impl ScanResult {
    fn empty(root: &std::path::Path, start: Instant) -> Self {
        ScanResult {
            root_name: root
                .file_name()
                .unwrap_or(root.as_os_str())
                .to_string_lossy()
                .into_owned(),
            root_path: root.to_string_lossy().into_owned(),
            total_size: 0,
            total_size_human: "0 B".into(),
            file_count: 0,
            dir_count: 0,
            children: vec![],
            elapsed_ms: start.elapsed().as_millis() as u64,
        }
    }
}
