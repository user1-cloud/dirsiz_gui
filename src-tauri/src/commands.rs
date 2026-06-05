use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::Emitter;
use walkdir::WalkDir;

const UNITS: &[&str] = &["B", "K", "M", "G", "T", "P", "E"];

fn human_size(bytes: u64) -> String {
    if bytes < 1024 {
        return format!("{} B", bytes);
    }
    let size = bytes as f64;
    let idx = ((size.log2() / 10.0) as usize).min(UNITS.len() - 1);
    format!("{:.1} {}", size / (1024u64.pow(idx as u32) as f64), UNITS[idx])
}

fn strip_extended_prefix(path: PathBuf) -> PathBuf {
    let s = path.to_string_lossy();
    if let Some(stripped) = s.strip_prefix(r"\\?\") {
        PathBuf::from(stripped)
    } else {
        path
    }
}

fn is_hidden(name: &std::ffi::OsStr) -> bool {
    name.to_str().map(|s| s.starts_with('.')).unwrap_or(false)
}

// ── Data structures ────────────────────────────────────────────────────

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
struct ProgressPayload {
    files: u64,
    bytes: u64,
    bytes_human: String,
}

struct Entry {
    path: PathBuf,
    size: u64,
    depth: u32,
    is_dir: bool,
}

// ── Walk (matches CLI walk_serial exactly) ─────────────────────────────

fn walk_serial(
    root: &Path,
    show_hidden: bool,
    app: &tauri::AppHandle,
    start: Instant,
) -> Result<Vec<Entry>, String> {
    let walker = WalkDir::new(root).into_iter().filter_entry(|e| {
        e.depth() == 0 || show_hidden || !is_hidden(e.file_name())
    });

    let mut entries: Vec<Entry> = Vec::with_capacity(200_000);
    let mut files: u64 = 0;
    let mut bytes: u64 = 0;
    let tick = Duration::from_millis(100);
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

// ── Parallel walk (jwalk) ────────────────────────────────────────────

fn walk_parallel(
    root: &Path,
    show_hidden: bool,
    threads: usize,
    app: &tauri::AppHandle,
    start: Instant,
) -> Result<Vec<Entry>, String> {
    let wd = jwalk::WalkDir::new(root)
        .skip_hidden(!show_hidden)
        .parallelism(jwalk::Parallelism::RayonNewPool(threads));

    let mut files: u64 = 0;
    let mut bytes: u64 = 0;
    let tick = Duration::from_millis(100);
    let mut next_tick = start + tick;
    let mut entries: Vec<Entry> = Vec::with_capacity(200_000);

    for entry in wd.into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
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

// ── Auto-detect serial vs parallel ────────────────────────────────────

fn auto_walk(
    root: &Path,
    show_hidden: bool,
    app: &tauri::AppHandle,
    start: Instant,
) -> Result<Vec<Entry>, String> {
    let top_count = std::fs::read_dir(root).map(|rd| rd.count()).unwrap_or(0);
    // > 100 top-level entries signals a large directory worth parallelizing
    if top_count > 100 {
        let threads = std::thread::available_parallelism()
            .map(|n| n.get().min(8))
            .unwrap_or(4);
        walk_parallel(root, show_hidden, threads, app, start)
    } else {
        walk_serial(root, show_hidden, app, start)
    }
}

// ── Size propagation + tree build ─────────────────────────────────────

fn propagate_and_build(
    mut entries: Vec<Entry>,
    root: &Path,
) -> (
    HashMap<PathBuf, u64>,
    HashMap<PathBuf, Vec<(PathBuf, u64, bool)>>,
) {
    // Sort deepest-first + propagate sizes upward (matches CLI exactly)
    entries.sort_unstable_by_key(|e| e.depth);
    entries.reverse();

    let mut sizes: HashMap<PathBuf, u64> = HashMap::with_capacity(entries.len());

    for entry in &entries {
        let current = sizes.get(&entry.path).copied().unwrap_or(0);
        let total = current + entry.size;
        sizes.insert(entry.path.clone(), total);
        if let Some(parent) = entry.path.parent() {
            *sizes.entry(parent.to_path_buf()).or_insert(0) += total;
        }
    }

    // Build tree adjacency using stored is_dir (avoids stat() syscalls!)
    let mut tree: HashMap<PathBuf, Vec<(PathBuf, u64, bool)>> = HashMap::new();

    for entry in &entries {
        if entry.path == root {
            continue;
        }
        if let Some(parent) = entry.path.parent() {
            let size = sizes.get(&entry.path).copied().unwrap_or(0);
            tree.entry(parent.to_path_buf())
                .or_default()
                .push((entry.path.clone(), size, entry.is_dir));
        }
    }

    drop(entries);

    for children in tree.values_mut() {
        children.sort_by(|a, b| b.1.cmp(&a.1));
    }

    (sizes, tree)
}

fn build_one_level(
    tree: &HashMap<PathBuf, Vec<(PathBuf, u64, bool)>>,
    dir: &Path,
) -> Vec<DirEntry> {
    let children = match tree.get(dir) {
        Some(c) => c,
        None => return vec![],
    };

    children
        .iter()
        .map(|(path, size, is_dir)| {
            let name = path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned();
            let child_count = if *is_dir {
                tree.get(path).map(|c| c.len() as u64).unwrap_or(0)
            } else {
                0
            };

            DirEntry {
                name,
                path: path.to_string_lossy().into_owned(),
                size: *size,
                size_human: human_size(*size),
                is_dir: *is_dir,
                child_count,
                children: vec![],
            }
        })
        .collect()
}

// ── Commands ───────────────────────────────────────────────────────────

#[tauri::command]
pub fn scan_directory(
    app: tauri::AppHandle,
    path: String,
    show_hidden: bool,
) -> Result<ScanResult, String> {
    let start = Instant::now();
    let root = Path::new(&path);

    let root = match root.canonicalize() {
        Ok(p) => strip_extended_prefix(p),
        Err(e) => return Err(format!("Cannot access '{}': {}", path, e)),
    };

    if !root.is_dir() {
        return Err(format!("'{}' is not a directory", root.display()));
    }

    let entries = auto_walk(&root, show_hidden, &app, start)?;

    if entries.is_empty() {
        return Ok(ScanResult {
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
        });
    }

    let file_count = entries.iter().filter(|e| !e.is_dir).count() as u64;
    let dir_count = entries.iter().filter(|e| e.is_dir).count() as u64;

    let (sizes, tree) = propagate_and_build(entries, &root);
    let total_size = sizes.get(&root).copied().unwrap_or(0);
    let children = build_one_level(&tree, &root);

    Ok(ScanResult {
        root_name: root
            .file_name()
            .unwrap_or(root.as_os_str())
            .to_string_lossy()
            .into_owned(),
        root_path: root.to_string_lossy().into_owned(),
        total_size,
        total_size_human: human_size(total_size),
        file_count,
        dir_count,
        children,
        elapsed_ms: start.elapsed().as_millis() as u64,
    })
}

#[tauri::command]
pub fn expand_directory(
    app: tauri::AppHandle,
    path: String,
    show_hidden: bool,
) -> Result<Vec<DirEntry>, String> {
    let dir = Path::new(&path);
    let dir = match dir.canonicalize() {
        Ok(p) => strip_extended_prefix(p),
        Err(e) => return Err(format!("Cannot access '{}': {}", path, e)),
    };

    if !dir.is_dir() {
        return Err(format!("'{}' is not a directory", dir.display()));
    }

    let start = Instant::now();
    let entries = auto_walk(&dir, show_hidden, &app, start)?;

    if entries.is_empty() {
        return Ok(vec![]);
    }

    let (_sizes, tree) = propagate_and_build(entries, &dir);
    Ok(build_one_level(&tree, &dir))
}
