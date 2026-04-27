use duckdb::Connection;
use rayon::prelude::*;
use std::path::PathBuf;
use tracing::{error, warn};

pub struct AnalyticsEngine {
    db_path: PathBuf,
}

impl AnalyticsEngine {
    pub fn new(db_path: PathBuf) -> Self {
        Self { db_path }
    }

    /// Performs an analytical query using DuckDB's SQLite Scanner.
    /// This keeps the memory footprint low while providing high-speed aggregation.
    pub fn query_bom_summary(&self) -> Result<Vec<(String, f64, f64)>, String> {
        let conn = Connection::open_in_memory().map_err(|e| e.to_string())?;

        // V2 Fix: Check if file exists and has content before ATTACH
        if !self.db_path.exists() {
            return Err(format!("Database file not found: {:?}", self.db_path));
        }

        let metadata = std::fs::metadata(&self.db_path).map_err(|e| e.to_string())?;
        if metadata.len() == 0 {
            warn!(
                "[Analytics] Database file is empty, skipping analysis: {:?}",
                self.db_path
            );
            return Ok(Vec::new()); // Return empty results for empty DB
        }

        let attach_sql = format!(
            "ATTACH '{}' AS project_db (TYPE SQLITE);",
            self.db_path.to_string_lossy()
        );

        // V2 Fix: Retry ATTACH if database is locked
        let mut retry_count = 0;
        let max_retries = 3;
        loop {
            match conn.execute(&attach_sql, []) {
                Ok(_) => break,
                Err(e)
                    if retry_count < max_retries
                        && (e.to_string().contains("locked") || e.to_string().contains("Busy")) =>
                {
                    retry_count += 1;
                    std::thread::sleep(std::time::Duration::from_millis(100 * retry_count));
                    warn!(
                        "[Analytics] DuckDB ATTACH Busy, retry {}/{}",
                        retry_count, max_retries
                    );
                    continue;
                }
                Err(e) => {
                    error!(
                        "[Analytics] DuckDB Attach Error: {} (File: {:?})",
                        e, self.db_path
                    );
                    return Err(format!("DuckDB Attach Error: {}", e));
                }
            }
        }

        // Query example: Summarize work items by name and quantity
        let mut stmt = conn
            .prepare(
                "SELECT name, SUM(quantity), SUM(total_price) 
             FROM project_db.work_items 
             GROUP BY name 
             ORDER BY SUM(total_price) DESC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
            .map_err(|e| e.to_string())?;

        let results: Vec<_> = rows.flatten().collect();
        Ok(results)
    }

    /// Optimized analysis using Rayon for heavy data transformation.
    /// This demonstrates how we can scale analytical tasks across multiple CPU cores.
    pub fn parallel_bom_analysis(&self, items: Vec<(String, f64, f64)>) -> Vec<(String, f64)> {
        items
            .into_par_iter()
            .map(|(name, _, price)| {
                // Giả lập một phép tính phức tạp (ví dụ: Tax calculation, Currency conversion)
                let adjusted_price = price * 1.1;
                (name, adjusted_price)
            })
            .collect()
    }

    /// Generic analysis query for developer-defined insights.
    /// Security: Only allows SELECT statements to prevent mutation or secondary attachment.
    pub fn run_custom_analysis(&self, sql: &str) -> Result<String, String> {
        // V2 Security Fix: Sanitize SQL to allow ONLY SELECT
        let sql_upper = sql.to_uppercase();
        let forbidden_keywords = [
            "INSERT", "UPDATE", "DELETE", "DROP", "CREATE", "ALTER", "ATTACH", "DETACH", "PRAGMA",
        ];

        for keyword in forbidden_keywords {
            if sql_upper.contains(keyword) {
                return Err(format!(
                    "Security Error: Forbidden SQL keyword '{}'",
                    keyword
                ));
            }
        }

        if !sql_upper.trim_start().starts_with("SELECT") {
            return Err(
                "Security Error: Only SELECT queries are allowed for custom analysis".to_string(),
            );
        }

        let conn = Connection::open_in_memory().map_err(|e| e.to_string())?;

        // V2 Fix: Check if file exists and has content before ATTACH
        if !self.db_path.exists() {
            return Err(format!("Database file not found: {:?}", self.db_path));
        }

        let metadata = std::fs::metadata(&self.db_path).map_err(|e| e.to_string())?;
        if metadata.len() == 0 {
            warn!(
                "[Analytics] Database file is empty, skipping analysis: {:?}",
                self.db_path
            );
            return Err("Cannot run custom analysis on an empty database".to_string());
        }

        let attach_sql = format!(
            "ATTACH '{}' AS project_db (TYPE SQLITE);",
            self.db_path.to_string_lossy()
        );
        conn.execute(&attach_sql, []).map_err(|e| {
            error!(
                "[Analytics] DuckDB Attach Error: {} (File: {:?})",
                e, self.db_path
            );
            format!("DuckDB Attach Error: {}", e)
        })?;

        // Use query_row and attempt to get first column as String or compatible
        let result: String = conn
            .query_row(sql, [], |r| {
                // Try to get value and convert to string regardless of type
                let val: duckdb::types::Value = r.get(0)?;
                Ok(format!("{:?}", val))
            })
            .map_err(|e| e.to_string())?;

        Ok(result)
    }
}
