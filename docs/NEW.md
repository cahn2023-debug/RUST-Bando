Single Writer Actor Implementation với Tokio
Mục tiêu: Một thread/task duy nhất sở hữu rusqlite::Connection và xử lý mọi write request tuần tự. Producer là các command Tauri gửi message; consumer thực thi SQL và trả kết quả qua oneshot.

Ưu điểm: loại bỏ contention write, dễ log, dễ retry, dễ checkpoint WAL.

Mã mẫu

rust
use tokio::sync::{mpsc, oneshot};
use rusqlite::{Connection, params};
use uuid::Uuid;
use std::path::PathBuf;
use tracing::{info, error};

#[derive(Debug)]
pub enum WriterCommand {
AppendEvent { blob: Vec<u8>, resp: oneshot::Sender<Result<Uuid, String>> },
ExecuteSql { sql: String, resp: oneshot::Sender<Result<(), String>> },
Shutdown,
}

pub struct WriterHandle {
tx: mpsc::Sender<WriterCommand>,
}

impl WriterHandle {
pub fn new(tx: mpsc::Sender<WriterCommand>) -> Self { Self { tx } }

pub async fn append_event(&self, blob: Vec<u8>) -> Result<Uuid, String> {
let (resp_tx, resp_rx) = oneshot::channel();
let cmd = WriterCommand::AppendEvent { blob, resp: resp_tx };
self.tx.send(cmd).await.map_err(|e| format!("send failed: {}", e))?;
resp_rx.await.map_err(|e| format!("recv failed: {}", e))?
}
}

pub async fn start_writer_actor(db_path: PathBuf, mut rx: mpsc::Receiver<WriterCommand>) {
// Open connection on this task/thread only
let conn = match Connection::open(&db_path) {
Ok(c) => c,
Err(e) => {
error!("Failed open DB: {}", e);
return;
}
};
// PRAGMA setup
conn.execute_batch("
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
").ok();

while let Some(cmd) = rx.recv().await {
match cmd {
WriterCommand::AppendEvent { blob, resp } => {
let res = (|| {
let tx = conn.transaction().map_err(|e| e.to_string())?;
let event_id = Uuid::new_v4();
tx.execute(
"INSERT INTO event_store (event_id, schema_version, blob) VALUES (?1, ?2, ?3)",
params![event_id.to_string(), 1u32, blob],
).map_err(|e| e.to_string())?;
tx.commit().map_err(|e| e.to_string())?;
Ok(event_id)
})();
let _ = resp.send(res);
}
WriterCommand::ExecuteSql { sql, resp } => {
let res = conn.execute_batch(&sql).map_err(|e| e.to_string());
let _ = resp.send(res);
}
WriterCommand::Shutdown => {
info!("Writer actor shutting down");
break;
}
}
}
// optional checkpoint
let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
}
Tích hợp với Tauri Commands
Pattern: Tauri command làm chuẩn bị dữ liệu, gọi writer handle để gửi job, chờ oneshot kết quả.

Mã mẫu

rust
#[tauri::command]
async fn update_entity_metadata_v2(
state: tauri::State<'_, AppState>, // AppState chứa WriterHandle
payload: String,
) -> Result<UpdateResponse, ApiError> {
// 1. Prepare before lock: parse + validate
let dto = parse_and_validate(&payload).map_err(|e| ApiError::bad_request(e))?;

// 2. Build event blob off-thread
let blob = bincode::serialize(&dto).map_err(|e| ApiError::internal(e.to_string()))?;

// 3. Send to writer actor
let event_id = state.writer.append_event(blob).await.map_err(|e| ApiError::internal(e))?;

Ok(UpdateResponse { event_id: event_id.to_string() })
}
AppState example

rust
pub struct AppState {
pub writer: WriterHandle,
}
Backpressure Retry và BEGIN IMMEDIATE
Chiến lược retry: Actor pattern giảm hẳn SQLITE_BUSY, nhưng vẫn cần retry cho các thao tác quan trọng.

Trong actor: nếu một SQL trả lỗi DatabaseBusy, actor có thể retry nội bộ với exponential backoff ngắn trước khi trả lỗi cho caller.

BEGIN IMMEDIATE: dùng cho transaction cần đảm bảo lấy write lock sớm. Nếu BEGIN IMMEDIATE fail, trả lỗi nhanh cho caller để frontend retry hoặc user được thông báo.

Ví dụ retry trong actor

rust
fn exec_with_retry(conn: &Connection, f: impl Fn(&Connection) -> rusqlite::Result<()>) -> rusqlite::Result<()> {
let mut attempts = 0;
loop {
match f(conn) {
Ok(_) => return Ok(()),
Err(e) => {
if e.sqlite_error_code() == Some(rusqlite::ErrorCode::DatabaseBusy) && attempts < 5 {
attempts += 1;
std::thread::sleep(std::time::Duration::from_millis(20 * 2u64.pow(attempts)));
continue;
}
return Err(e);
}
}
}
}
Instrumentation Debugging và Observability
Cần triển khai ngay:

tracing + tracing-subscriber cho structured logs.

Log mỗi request tới writer: request_id, type, start_ts, duration, rows affected, error.

Metrics: counters cho db_locked, writes, write_latency_ms (Prometheus/Grafana).

Health endpoints: expose writer queue length để phát hiện backpressure.

Practical logs

Log khi transaction > 50ms: include SQL fingerprint, request_id, stack trace optional.

Log khi retry xảy ra: count và backoff durations.

Lộ trình chuyển đổi incremental
Mục tiêu: chuyển dần sang actor mà không phá vỡ hệ thống hiện tại.

Hotfix ngay

Set PRAGMA busy_timeout = 5000 cho mọi connection.

Áp dụng run_in_transaction wrapper với retry/backoff cho tất cả write hiện tại.

Introduce Writer Actor song song

Tạo writer actor và WriterHandle trong main.rs.

Migrate 20% các command ghi ít rủi ro sang actor (ví dụ: append_event).

Giữ code cũ cho các path chưa migrate.

Monitor và tăng tỷ lệ

Quan sát queue length, write latency, db_locked metric.

Nếu ổn, migrate tiếp 50% còn lại.

Cutover hoàn toàn

Khi mọi write path đã dùng actor, loại bỏ code mở connection write rải rác.

Thực hiện stress test 100 concurrent readers + 10 writers simulated.

Tối ưu thêm

Nếu cần throughput cao hơn, cân nhắc batching writes trong actor hoặc compacting WAL định kỳ.

Tests và Stress Scenarios
Unit tests: append_event round-trip, error mapping, retry logic.

Integration tests: spawn N tokio tasks gửi writes qua Tauri command wrapper, assert no DatabaseLocked returned.

Stress test: local harness spawn 200 readers + 50 producers; đo tỉ lệ lỗi, latency, queue length.

Chaos test: kill writer actor mid-transaction, restart, assert DB integrity and WAL checkpoint.

Kết luận và checklist hành động ngay
Đã làm ngay

[ ] PRAGMA busy_timeout = 5000 cho mọi connection.

[ ] run_in_transaction wrapper với retry/backoff.

[ ] Logging transaction start/commit/duration.

Triển khai trong 1 ngày

[ ] Tạo writer actor, WriterHandle, start_writer_actor trong main.

[ ] Migrate 1-2 non-critical write commands sang actor.

Triển khai trong 3 ngày

[ ] Migrate majority write paths, add metrics, stress test.

Triển khai trong 1 tuần

[ ] Full cutover, remove rogue opens, add WAL checkpointing policy.

