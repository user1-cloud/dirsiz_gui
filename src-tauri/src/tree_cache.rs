// ═══════════════════════════════════════════════════════════════════
// Global tree cache — holds the TreeMap from the most recent MFT
// scan. expand_directory can serve sub-folder expansion directly
// from this cache in O(1) instead of re-walking the filesystem.
// ═══════════════════════════════════════════════════════════════════

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::tree::TreeMap;

/// Generation-tagged cache. Each scan increments the generation;
/// expand_directory matches against it to detect stale data.
struct Cache {
    gen: u64,
    root: PathBuf,
    tree: TreeMap,
}

static CACHE: Mutex<Option<Cache>> = Mutex::new(None);

/// Store the tree map from a completed scan.
pub fn store(gen: u64, root: PathBuf, tree: TreeMap) {
    if let Ok(mut c) = CACHE.lock() {
        *c = Some(Cache { gen, root, tree });
    }
}

/// Look up the children (with propagated sizes) of a directory
/// from the cached tree. Returns None if the cache is stale or
/// the path is not within the cached root.
pub fn lookup(
    gen: u64,
    dir: &Path,
) -> Option<Vec<(PathBuf, u64, bool)>> {
    let c = CACHE.lock().ok()?;
    let cache = c.as_ref()?;

    if cache.gen != gen {
        return None;
    }

    // Only serve paths under the cached root
    if !dir.starts_with(&cache.root) {
        return None;
    }

    cache.tree.get(dir).cloned()
}

/// Clear the cache (call on scan cancel).
pub fn invalidate() {
    if let Ok(mut c) = CACHE.lock() {
        *c = None;
    }
}
