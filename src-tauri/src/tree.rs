// ═══════════════════════════════════════════════════════════════════
// Tree building — size propagation + adjacency + one-level builder
// Shared by both MFT and walkdir scanners
// ═══════════════════════════════════════════════════════════════════

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::models::{human_size, DirEntry, Entry};

pub type SizeMap = HashMap<PathBuf, u64>;
pub type TreeMap = HashMap<PathBuf, Vec<(PathBuf, u64, bool)>>;

pub fn propagate_and_build(
    mut entries: Vec<Entry>,
    root: &Path,
) -> (SizeMap, TreeMap) {
    entries.sort_unstable_by_key(|e| e.depth);
    entries.reverse();

    let mut sizes: HashMap<PathBuf, u64> = HashMap::with_capacity(entries.len());

    for entry in &entries {
        let current = sizes.get(&entry.path).copied().unwrap_or(0);
        let total = current.saturating_add(entry.size);
        sizes.insert(entry.path.clone(), total);
        if let Some(parent) = entry.path.parent() {
            let e = sizes.entry(parent.to_path_buf()).or_insert(0);
            *e = e.saturating_add(total);
        }
    }

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
        children.sort_by_key(|b| std::cmp::Reverse(b.1));
    }

    (sizes, tree)
}

pub fn build_one_level(
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
