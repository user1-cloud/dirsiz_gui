use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::Serialize;
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub size_human: String,
    pub is_dir: bool,
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

struct FlatEntry {
    path: PathBuf,
    size: u64,
    depth: u32,
    is_dir: bool,
}

fn build_dir_children(
    tree: &HashMap<PathBuf, Vec<(PathBuf, u64, bool)>>,
    sizes: &HashMap<PathBuf, u64>,
    dir: &Path,
) -> Vec<DirEntry> {
    let children = match tree.get(dir) {
        Some(c) => c,
        None => return vec![],
    };

    children
        .iter()
        .map(|(path, _size, is_dir)| {
            let size = sizes.get(path).copied().unwrap_or(0);
            let name = path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned();
            let sub_children = if *is_dir {
                build_dir_children(tree, sizes, path)
            } else {
                vec![]
            };

            DirEntry {
                name,
                path: path.to_string_lossy().into_owned(),
                size,
                size_human: human_size(size),
                is_dir: *is_dir,
                children: sub_children,
            }
        })
        .collect()
}

#[tauri::command]
pub fn scan_directory(path: String, show_hidden: bool) -> Result<ScanResult, String> {
    let start = std::time::Instant::now();
    let root = Path::new(&path);

    let root = match root.canonicalize() {
        Ok(p) => strip_extended_prefix(p),
        Err(e) => return Err(format!("Cannot access '{}': {}", path, e)),
    };

    if !root.is_dir() {
        return Err(format!("'{}' is not a directory", root.display()));
    }

    let walker = WalkDir::new(&root).into_iter().filter_entry(|e| {
        e.depth() == 0 || show_hidden || !is_hidden(e.file_name())
    });

    let mut entries: Vec<FlatEntry> = Vec::new();
    let mut file_count: u64 = 0;

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

        if !is_dir {
            file_count += 1;
        }
        entries.push(FlatEntry { path, size, depth, is_dir });
    }

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

    let mut tree: HashMap<PathBuf, Vec<(PathBuf, u64, bool)>> = HashMap::new();

    for entry in &entries {
        if entry.path == root {
            continue;
        }
        if let Some(parent) = entry.path.parent() {
            tree.entry(parent.to_path_buf())
                .or_default()
                .push((entry.path.clone(), sizes.get(&entry.path).copied().unwrap_or(0), entry.is_dir));
        }
    }

    for children in tree.values_mut() {
        children.sort_by(|a, b| b.1.cmp(&a.1));
    }

    let children = build_dir_children(&tree, &sizes, &root);
    let dir_count = entries.iter().filter(|e| e.is_dir).count() as u64;
    let total_size = sizes.get(&root).copied().unwrap_or(0);

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
