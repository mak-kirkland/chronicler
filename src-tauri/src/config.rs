//! Application constants.
//!
//! Centralizes tunable parameters and limits.

use std::time::Duration;

pub const WORLD_ROOT: &str = "/home/michael/DnDWorld";

/// The debounce interval for file changes in milliseconds.
/// This helps prevent multiple rapid updates from triggering too many re-indexes.
pub const DEBOUNCE_INTERVAL: Duration = Duration::from_millis(500);

/// Maximum file size to parse (1MB)
pub const MAX_FILE_SIZE: u64 = 1024 * 1024;

/// The default capacity for the broadcast channel.
/// This determines how many events can be buffered before older events are dropped.
///
/// A capacity of 100 should be sufficient for most use cases, as events are typically
/// processed quickly. If you have very high file change rates or slow subscribers,
/// you might need to increase this value.
pub const DEFAULT_EVENT_CHANNEL_CAPACITY: usize = 100;
