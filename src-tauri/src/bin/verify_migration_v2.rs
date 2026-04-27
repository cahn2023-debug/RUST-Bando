use design_core::implement::modules::v2::migration::engine::V1ToV2Migrator;
use env_logger::Env;
use rusqlite::Connection;
use std::path::Path;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Khởi tạo logger để xem output của Migrator
    env_logger::Builder::from_env(Env::default().default_filter_or("info")).init();

    let db_path = "Du_an_165.pmp";
    if !Path::new(db_path).exists() {
        log::error!("File not found: {}", db_path);
        return Ok(());
    }

    log::info!("Starting target verification on: {}", db_path);

    // Mở kết nối
    let conn = Connection::open(db_path)?;

    // Kiểm tra số lượng trước migration
    let v1_feature_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM features", [], |r| r.get(0))
        .unwrap_or(0);
    log::info!("V1 Features (Pre-migration): {}", v1_feature_count);

    // THỰC HIỆN MIGRATION
    log::info!("Running V1 -> V2 Migration Engine...");
    match V1ToV2Migrator::migrate(&conn) {
        Ok(report) => {
            log::info!("Migration Success!");
            log::info!("Report: {:?}", report);

            // KIỂM TRA KẾT QUẢ V2
            let event_count: i64 = conn
                .query_row("SELECT COUNT(*) FROM event_store", [], |r| r.get(0))
                .unwrap_or(0);

            let entity_index_count: i64 = conn
                .query_row("SELECT COUNT(*) FROM entity_index", [], |r| r.get(0))
                .unwrap_or(0);

            log::info!("V2 Event Store count: {}", event_count);
            log::info!("V2 Entity Index count: {}", entity_index_count);

            if event_count > 0 && entity_index_count > 0 {
                log::info!("VERIFICATION PASSED: Data successfully migrated and indexed.");
            } else {
                log::warn!("VERIFICATION WARNING: Migration succeeded but some tables are unexpectedly empty.");
            }
        }
        Err(e) => {
            log::error!("Migration FAILED: {}", e);
        }
    }

    Ok(())
}
