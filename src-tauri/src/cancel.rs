// ═══════════════════════════════════════════════════════════════════
// Global cancel token for cooperative scan cancellation
// ═══════════════════════════════════════════════════════════════════

use std::sync::atomic::{AtomicU64, Ordering};

pub static CANCEL_GEN: AtomicU64 = AtomicU64::new(0);

#[tauri::command]
pub fn cancel_scan() {
    CANCEL_GEN.fetch_add(1, Ordering::SeqCst);
    crate::tree_cache::invalidate();
}

/// Returns the current generation. The scan is cancelled when
/// CANCEL_GEN no longer matches this value.
pub fn current_gen() -> u64 {
    CANCEL_GEN.load(Ordering::Relaxed)
}
