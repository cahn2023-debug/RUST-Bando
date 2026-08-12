//! Disk-backed basemap tile cache.
//!
//! # Why this exists
//!
//! The basemap must be usable the moment the app opens, before any project is
//! loaded, and it must keep working when the machine is offline. Both goals need
//! tiles to survive process exit, which the webview's in-memory HTTP cache does
//! not guarantee. So tile fetches are proxied through Rust and persisted here.
//!
//! # Scope boundary
//!
//! This module knows nothing about projects. There is deliberately no
//! `project_id` column and the database lives outside any `.pmp` file: the
//! basemap is shared infrastructure, and a tile of Hanoi is the same tile
//! regardless of which project happens to be open. The existing
//! `map_tile_cache` table in the project schema is the opposite — project MVT
//! keyed by `(project_id, revision, …)` — and is not reusable here.
//!
//! # Upstream source
//!
//! [`ALLOWED_TILE_HOSTS`] is the only place that decides which servers may be
//! proxied, and it is the single seam to change when moving to a licensed tile
//! provider. Note that the currently configured `mt*.google.com` endpoint is
//! Google's internal Maps tile endpoint, not the licensed Maps Tiles API;
//! persisting its output to disk is outside the terms most Google Maps products
//! are offered under. That is a product/legal decision, not a technical one, so
//! it is recorded here rather than silently enforced — but keeping the allowlist
//! narrow means swapping providers touches one constant and nothing else.

use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

/// Hosts this proxy is willing to fetch from. Anything else is rejected before a
/// socket is opened, so a compromised renderer cannot use the command as an
/// arbitrary HTTP client (SSRF).
const ALLOWED_TILE_HOSTS: &[&str] = &[
    "mt0.google.com",
    "mt1.google.com",
    "mt2.google.com",
    "mt3.google.com",
];

/// Reject absurd payloads early; a 256px raster tile is a few tens of KB.
const MAX_TILE_BYTES: usize = 2 * 1024 * 1024;
/// Total on-disk budget. Vietnam at z0–z9 plus a working set of city-level tiles
/// fits comfortably; beyond this the least recently used tiles are dropped.
const CACHE_BUDGET_BYTES: i64 = 512 * 1024 * 1024;
/// Prune down to this fraction of the budget so pruning is amortised rather than
/// running on every insert once the cache is full.
const PRUNE_TARGET_RATIO: f64 = 0.85;
/// Check the budget every N writes instead of on each one.
const PRUNE_CHECK_INTERVAL: u64 = 256;
/// Tiles older than this are refetched. On a failed refetch the stale tile is
/// still served — a slightly outdated map beats no map when offline.
const TILE_TTL: Duration = Duration::from_secs(30 * 24 * 60 * 60);
const MAX_TILE_ZOOM: u8 = 22;
const FETCH_TIMEOUT: Duration = Duration::from_secs(15);

const SCHEMA_SQL: &str = r#"
    CREATE TABLE IF NOT EXISTS basemap_tiles (
        source_key   TEXT    NOT NULL,
        z            INTEGER NOT NULL,
        x            INTEGER NOT NULL,
        y            INTEGER NOT NULL,
        content_type TEXT    NOT NULL,
        bytes        BLOB    NOT NULL,
        byte_size    INTEGER NOT NULL,
        fetched_at   INTEGER NOT NULL,
        last_used_at INTEGER NOT NULL,
        PRIMARY KEY (source_key, z, x, y)
    );
    CREATE INDEX IF NOT EXISTS idx_basemap_tiles_lru ON basemap_tiles (last_used_at);
"#;

type Pool = r2d2::Pool<r2d2_sqlite::SqliteConnectionManager>;

static POOL: OnceLock<Result<Pool, String>> = OnceLock::new();
static HTTP: OnceLock<Result<reqwest::blocking::Client, String>> = OnceLock::new();
static WRITE_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TileRequest {
    /// Opaque cache partition. The frontend derives it from the preset plus the
    /// styling parameters baked into the URL, so a style change cannot serve
    /// tiles rendered with the previous style.
    pub source_key: String,
    pub z: u8,
    pub x: u32,
    pub y: u32,
    /// Fully-resolved upstream URL, host-checked against [`ALLOWED_TILE_HOSTS`].
    pub url: String,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrefetchReport {
    pub requested: usize,
    pub cached: usize,
    pub fetched: usize,
    pub failed: usize,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheStats {
    pub tile_count: i64,
    pub byte_size: i64,
    pub budget_bytes: i64,
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs() as i64)
        .unwrap_or(0)
}

fn cache_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data dir: {error}"))?
        .join("basemap");
    std::fs::create_dir_all(&dir)
        .map_err(|error| format!("Failed to create basemap cache dir: {error}"))?;
    Ok(dir.join("tiles.db"))
}

fn pool(app: &AppHandle) -> Result<&'static Pool, String> {
    POOL.get_or_init(|| {
        let path = cache_path(app)?;
        let manager = r2d2_sqlite::SqliteConnectionManager::file(path).with_init(|conn| {
            conn.pragma_update(None, "journal_mode", "WAL")?;
            conn.pragma_update(None, "synchronous", "NORMAL")?;
            conn.pragma_update(None, "busy_timeout", "5000")?;
            Ok(())
        });
        let pool = r2d2::Pool::builder()
            .max_size(6)
            .build(manager)
            .map_err(|error| format!("Failed to open basemap cache: {error}"))?;
        pool.get()
            .map_err(|error| format!("Failed to acquire basemap cache connection: {error}"))?
            .execute_batch(SCHEMA_SQL)
            .map_err(|error| format!("Failed to initialise basemap cache schema: {error}"))?;
        Ok(pool)
    })
    .as_ref()
    .map_err(|error| error.clone())
}

fn http() -> Result<&'static reqwest::blocking::Client, String> {
    HTTP.get_or_init(|| {
        reqwest::blocking::Client::builder()
            // Google's tile endpoint returns 403 to unknown agents.
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .timeout(FETCH_TIMEOUT)
            .build()
            .map_err(|error| format!("Failed to create tile HTTP client: {error}"))
    })
    .as_ref()
    .map_err(|error| error.clone())
}

fn validate(request: &TileRequest) -> Result<(), String> {
    if request.source_key.is_empty() || request.source_key.len() > 128 {
        return Err("Invalid tile source key".to_string());
    }
    if request.z > MAX_TILE_ZOOM {
        return Err(format!("Zoom {} is out of range", request.z));
    }
    let limit = 1u32 << request.z;
    if request.x >= limit || request.y >= limit {
        return Err(format!(
            "Tile {}/{}/{} is outside the pyramid",
            request.z, request.x, request.y
        ));
    }

    let parsed = url::Url::parse(&request.url).map_err(|error| format!("Invalid URL: {error}"))?;
    if parsed.scheme() != "https" {
        return Err("Only https tile URLs are supported".to_string());
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| "Tile URL must include a host".to_string())?
        .to_ascii_lowercase();
    if !ALLOWED_TILE_HOSTS.contains(&host.as_str()) {
        return Err(format!("Tile host is not allowed: {host}"));
    }
    Ok(())
}

struct CachedTile {
    bytes: Vec<u8>,
    fetched_at: i64,
}

fn read_cached(pool: &Pool, request: &TileRequest) -> Result<Option<CachedTile>, String> {
    let conn = pool
        .get()
        .map_err(|error| format!("Failed to acquire basemap cache connection: {error}"))?;
    conn.query_row(
        "SELECT bytes, fetched_at FROM basemap_tiles
         WHERE source_key = ?1 AND z = ?2 AND x = ?3 AND y = ?4",
        params![request.source_key, request.z, request.x, request.y],
        |row| {
            Ok(CachedTile {
                bytes: row.get(0)?,
                fetched_at: row.get(1)?,
            })
        },
    )
    .optional()
    .map_err(|error| format!("Failed to read cached tile: {error}"))
}

fn touch(pool: &Pool, request: &TileRequest) {
    if let Ok(conn) = pool.get() {
        let _ = conn.execute(
            "UPDATE basemap_tiles SET last_used_at = ?1
             WHERE source_key = ?2 AND z = ?3 AND x = ?4 AND y = ?5",
            params![
                now_secs(),
                request.source_key,
                request.z,
                request.x,
                request.y
            ],
        );
    }
}

fn store(
    pool: &Pool,
    request: &TileRequest,
    bytes: &[u8],
    content_type: &str,
) -> Result<(), String> {
    let conn = pool
        .get()
        .map_err(|error| format!("Failed to acquire basemap cache connection: {error}"))?;
    let timestamp = now_secs();
    conn.execute(
        "INSERT INTO basemap_tiles
            (source_key, z, x, y, content_type, bytes, byte_size, fetched_at, last_used_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
         ON CONFLICT (source_key, z, x, y) DO UPDATE SET
            content_type = excluded.content_type,
            bytes        = excluded.bytes,
            byte_size    = excluded.byte_size,
            fetched_at   = excluded.fetched_at,
            last_used_at = excluded.last_used_at",
        params![
            request.source_key,
            request.z,
            request.x,
            request.y,
            content_type,
            bytes,
            bytes.len() as i64,
            timestamp
        ],
    )
    .map_err(|error| format!("Failed to store tile: {error}"))?;

    if WRITE_COUNTER
        .fetch_add(1, Ordering::Relaxed)
        .is_multiple_of(PRUNE_CHECK_INTERVAL)
    {
        prune(pool);
    }
    Ok(())
}

/// Drop least-recently-used tiles until the cache is back under the budget.
///
/// Best-effort: a failure here means the cache is a bit larger than intended,
/// which must never turn into a failed tile request.
fn prune(pool: &Pool) {
    let Ok(conn) = pool.get() else { return };
    let total: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(byte_size), 0) FROM basemap_tiles",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    if total <= CACHE_BUDGET_BYTES {
        return;
    }

    let target = (CACHE_BUDGET_BYTES as f64 * PRUNE_TARGET_RATIO) as i64;
    let mut remaining = total;

    // Delete in bounded batches, re-measuring after each one. Bounded so a huge
    // overshoot cannot hold the write lock for an unbounded stretch, and capped
    // by iteration count so a bug here can never spin forever.
    for _ in 0..64 {
        let deleted = conn
            .execute(
                "DELETE FROM basemap_tiles WHERE rowid IN (
                     SELECT rowid FROM basemap_tiles ORDER BY last_used_at ASC LIMIT 500
                 )",
                [],
            )
            .unwrap_or(0);
        if deleted == 0 {
            break;
        }
        remaining = conn
            .query_row(
                "SELECT COALESCE(SUM(byte_size), 0) FROM basemap_tiles",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);
        if remaining <= target {
            break;
        }
    }

    log::info!(
        "[Basemap] tile cache pruned: {} MB -> {} MB",
        total / 1024 / 1024,
        remaining / 1024 / 1024
    );
}

fn fetch_upstream(request: &TileRequest) -> Result<(Vec<u8>, String), String> {
    let response = http()?
        .get(&request.url)
        .send()
        .map_err(|error| format!("Failed to fetch tile: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Tile server error: {error}"))?;

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("image/png")
        .split(';')
        .next()
        .unwrap_or("image/png")
        .to_string();

    let bytes = response
        .bytes()
        .map_err(|error| format!("Failed to read tile bytes: {error}"))?;
    if bytes.is_empty() {
        return Err("Tile server returned an empty response".to_string());
    }
    if bytes.len() > MAX_TILE_BYTES {
        return Err(format!("Tile is too large ({} bytes)", bytes.len()));
    }
    Ok((bytes.to_vec(), content_type))
}

/// Resolve one tile: fresh cache hit, else network, else stale cache hit.
///
/// The stale fallback is what makes the map work offline — an expired tile is
/// still a correct-looking map, whereas an error is a grey hole.
fn resolve(pool: &Pool, request: &TileRequest) -> Result<Vec<u8>, String> {
    let cached = read_cached(pool, request)?;
    let ttl = TILE_TTL.as_secs() as i64;
    if let Some(tile) = &cached {
        if now_secs().saturating_sub(tile.fetched_at) < ttl {
            touch(pool, request);
            return Ok(tile.bytes.clone());
        }
    }

    match fetch_upstream(request) {
        Ok((bytes, content_type)) => {
            if let Err(error) = store(pool, request, &bytes, &content_type) {
                log::warn!("[Basemap] tile cache write failed: {error}");
            }
            Ok(bytes)
        }
        Err(error) => match cached {
            Some(tile) => {
                log::debug!("[Basemap] serving stale tile after fetch failure: {error}");
                touch(pool, request);
                Ok(tile.bytes)
            }
            None => Err(error),
        },
    }
}

/// Fetch a single basemap tile, cache-first.
///
/// Returns raw bytes via [`tauri::ipc::Response`] rather than `Vec<u8>` so the
/// payload crosses IPC as binary instead of a JSON number array.
#[tauri::command]
pub async fn get_basemap_tile(
    app: AppHandle,
    request: TileRequest,
) -> Result<tauri::ipc::Response, String> {
    validate(&request)?;
    let pool = pool(&app)?.clone();
    let bytes = tokio::task::spawn_blocking(move || resolve(&pool, &request))
        .await
        .map_err(|error| format!("Tile task failed: {error}"))??;
    Ok(tauri::ipc::Response::new(bytes))
}

/// Warm the cache with a batch of tiles.
///
/// Called at launch to seed low-zoom coverage so opening a project never shows
/// an empty map. Individual failures are counted, not propagated: a warm-up that
/// aborts on the first offline tile is useless.
#[tauri::command]
pub async fn prefetch_basemap_tiles(
    app: AppHandle,
    requests: Vec<TileRequest>,
) -> Result<PrefetchReport, String> {
    let pool = pool(&app)?.clone();
    tokio::task::spawn_blocking(move || {
        let ttl = TILE_TTL.as_secs() as i64;
        let mut report = PrefetchReport {
            requested: requests.len(),
            ..Default::default()
        };

        for request in requests {
            if validate(&request).is_err() {
                report.failed += 1;
                continue;
            }
            match read_cached(&pool, &request) {
                Ok(Some(tile)) if now_secs().saturating_sub(tile.fetched_at) < ttl => {
                    report.cached += 1;
                    continue;
                }
                Ok(_) => {}
                Err(_) => {
                    report.failed += 1;
                    continue;
                }
            }
            match fetch_upstream(&request) {
                Ok((bytes, content_type)) => match store(&pool, &request, &bytes, &content_type) {
                    Ok(()) => report.fetched += 1,
                    Err(_) => report.failed += 1,
                },
                Err(_) => report.failed += 1,
            }
        }
        report
    })
    .await
    .map_err(|error| format!("Prefetch task failed: {error}"))
}

#[tauri::command]
pub async fn get_basemap_cache_stats(app: AppHandle) -> Result<CacheStats, String> {
    let pool = pool(&app)?.clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool
            .get()
            .map_err(|error| format!("Failed to acquire basemap cache connection: {error}"))?;
        let (tile_count, byte_size) = conn
            .query_row(
                "SELECT COUNT(*), COALESCE(SUM(byte_size), 0) FROM basemap_tiles",
                [],
                |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
            )
            .map_err(|error| format!("Failed to read cache stats: {error}"))?;
        Ok(CacheStats {
            tile_count,
            byte_size,
            budget_bytes: CACHE_BUDGET_BYTES,
        })
    })
    .await
    .map_err(|error| format!("Cache stats task failed: {error}"))?
}

/// Empty the tile cache. Exposed so cached map imagery can be purged on demand
/// without hunting for the database file.
#[tauri::command]
pub async fn clear_basemap_tile_cache(app: AppHandle) -> Result<u64, String> {
    let pool = pool(&app)?.clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool
            .get()
            .map_err(|error| format!("Failed to acquire basemap cache connection: {error}"))?;
        let removed = conn
            .execute("DELETE FROM basemap_tiles", [])
            .map_err(|error| format!("Failed to clear tile cache: {error}"))?;
        let _ = conn.execute_batch("VACUUM;");
        Ok(removed as u64)
    })
    .await
    .map_err(|error| format!("Clear cache task failed: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(z: u8, x: u32, y: u32, url: &str) -> TileRequest {
        TileRequest {
            source_key: "street".to_string(),
            z,
            x,
            y,
            url: url.to_string(),
        }
    }

    #[test]
    fn rejects_hosts_outside_the_allowlist() {
        let denied = request(1, 0, 0, "https://evil.example/vt/x=0&y=0&z=1");
        assert!(validate(&denied).is_err());
    }

    #[test]
    fn rejects_non_https_and_loopback_schemes() {
        assert!(validate(&request(1, 0, 0, "http://mt0.google.com/vt")).is_err());
        assert!(validate(&request(1, 0, 0, "file:///etc/passwd")).is_err());
    }

    #[test]
    fn rejects_coordinates_outside_the_pyramid() {
        let url = "https://mt0.google.com/vt/lyrs=m&x=4&y=0&z=1";
        assert!(validate(&request(1, 4, 0, url)).is_err());
        assert!(validate(&request(1, 0, 2, url)).is_err());
        assert!(validate(&request(1, 1, 1, url)).is_ok());
    }

    #[test]
    fn rejects_zoom_beyond_the_pyramid() {
        let url = "https://mt1.google.com/vt/lyrs=m&x=0&y=0&z=30";
        assert!(validate(&request(30, 0, 0, url)).is_err());
    }

    #[test]
    fn requires_a_source_key() {
        let mut denied = request(1, 0, 0, "https://mt0.google.com/vt/lyrs=m&x=0&y=0&z=1");
        denied.source_key = String::new();
        assert!(validate(&denied).is_err());
    }
}
