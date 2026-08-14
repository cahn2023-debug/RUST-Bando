use rusqlite::{params, Connection, Result};

pub struct GpkgFeature {
    pub id: String,
    pub layer_id: String,
    pub name: String,
    pub geom_type: String,
    pub coordinates_json: String,
    pub properties_json: String,
    pub min_x: f64,
    pub max_x: f64,
    pub min_y: f64,
    pub max_y: f64,
}

/// Khởi tạo bảng chuẩn OGC GeoPackage và SQLite R-Tree Spatial Index.
pub fn init_gpkg_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        -- Bảng chuẩn OGC GeoPackage Spatial Ref Sys
        CREATE TABLE IF NOT EXISTS gpkg_spatial_ref_sys (
            srs_name TEXT NOT NULL,
            srs_id INTEGER NOT NULL PRIMARY KEY,
            organization TEXT NOT NULL,
            organization_coordsys_id INTEGER NOT NULL,
            definition TEXT NOT NULL,
            description TEXT
        );

        -- Insert EPSG:4326 & EPSG:3857 nếu chưa có
        INSERT OR IGNORE INTO gpkg_spatial_ref_sys VALUES
        ('WGS 84 geodetic', 4326, 'EPSG', 4326, 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]', 'WGS 84'),
        ('WGS 84 / Pseudo-Mercator', 3857, 'EPSG', 3857, 'PROJCS["WGS 84 / Pseudo-Mercator",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Mercator_1SP"],PARAMETER["central_meridian",0],PARAMETER["scale_factor",1],PARAMETER["false_easting",0],PARAMETER["false_northing",0],UNIT["metre",1]]', 'Web Mercator');

        -- Bảng chuẩn OGC GeoPackage Contents
        CREATE TABLE IF NOT EXISTS gpkg_contents (
            table_name TEXT NOT NULL PRIMARY KEY,
            data_type TEXT NOT NULL,
            identifier TEXT UNIQUE,
            description TEXT DEFAULT '',
            last_change TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            min_x REAL,
            min_y REAL,
            max_x REAL,
            max_y REAL,
            srs_id INTEGER REFERENCES gpkg_spatial_ref_sys(srs_id)
        );

        -- Bảng chuẩn OGC GeoPackage Geometry Columns
        CREATE TABLE IF NOT EXISTS gpkg_geometry_columns (
            table_name TEXT NOT NULL,
            column_name TEXT NOT NULL,
            geometry_type_name TEXT NOT NULL,
            srs_id INTEGER NOT NULL REFERENCES gpkg_spatial_ref_sys(srs_id),
            z TINYINT NOT NULL,
            m TINYINT NOT NULL,
            CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name)
        );

        INSERT OR IGNORE INTO gpkg_contents (table_name, data_type, identifier, srs_id)
        VALUES ('features', 'features', 'Project Features', 4326);

        INSERT OR IGNORE INTO gpkg_geometry_columns (table_name, column_name, geometry_type_name, srs_id, z, m)
        VALUES ('features', 'coordinates_json', 'GEOMETRY', 4326, 0, 0);

        -- SQLite R-Tree Virtual Table cho Spatial Indexing siêu tốc (1-5ms)
        CREATE VIRTUAL TABLE IF NOT EXISTS rtree_features_bbox USING rtree(
            rowid,
            min_x, max_x,
            min_y, max_y
        );
        "#,
    )?;

    // Tự động đồng bộ các feature vào R-Tree index nếu R-Tree đang trống
    sync_rtree_index_if_needed(conn)?;

    Ok(())
}

/// Đồng bộ dữ liệu bbox từ bảng features vào R-Tree spatial index table.
pub fn sync_rtree_index_if_needed(conn: &Connection) -> Result<()> {
    let rtree_count: i64 =
        conn.query_row("SELECT COUNT(*) FROM rtree_features_bbox", [], |r| r.get(0))?;
    let feature_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM features WHERE bbox_min_x IS NOT NULL",
        [],
        |r| r.get(0),
    )?;

    if rtree_count < feature_count {
        conn.execute_batch(
            r#"
            INSERT OR REPLACE INTO rtree_features_bbox(rowid, min_x, max_x, min_y, max_y)
            SELECT rowid, bbox_min_x, bbox_max_x, bbox_min_y, bbox_max_y
            FROM features
            WHERE bbox_min_x IS NOT NULL AND bbox_max_x IS NOT NULL
              AND bbox_min_y IS NOT NULL AND bbox_max_y IS NOT NULL;
            "#,
        )?;
    }
    Ok(())
}

/// Thêm/cập nhật 1 feature vào R-Tree index
pub fn update_rtree_feature(
    conn: &Connection,
    rowid: i64,
    min_x: f64,
    max_x: f64,
    min_y: f64,
    max_y: f64,
) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO rtree_features_bbox(rowid, min_x, max_x, min_y, max_y) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![rowid, min_x, max_x, min_y, max_y],
    )?;
    Ok(())
}

/// Truy vấn các đối tượng nằm trong tile bbox (min_x, max_x, min_y, max_y) sử dụng R-Tree Index.
pub fn query_features_by_tile_bbox(
    conn: &Connection,
    project_id: &str,
    min_x: f64,
    max_x: f64,
    min_y: f64,
    max_y: f64,
    limit: usize,
) -> Result<Vec<GpkgFeature>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT f.id, f.layer_id, COALESCE(f.name, 'Untitled'), f.geom_type,
               f.coordinates_json, COALESCE(f.properties_json, '{}'),
               f.bbox_min_x, f.bbox_max_x, f.bbox_min_y, f.bbox_max_y
        FROM features f
        JOIN rtree_features_bbox r ON f.rowid = r.rowid
        WHERE f.project_id = ?1
          AND r.min_x <= ?3 AND r.max_x >= ?2
          AND r.min_y <= ?5 AND r.max_y >= ?4
        LIMIT ?6
        "#,
    )?;

    let rows = stmt.query_map(
        params![project_id, min_x, max_x, min_y, max_y, limit as i64],
        |row| {
            Ok(GpkgFeature {
                id: row.get(0)?,
                layer_id: row.get(1)?,
                name: row.get(2)?,
                geom_type: row.get(3)?,
                coordinates_json: row.get(4)?,
                properties_json: row.get(5)?,
                min_x: row.get::<_, Option<f64>>(6)?.unwrap_or(min_x),
                max_x: row.get::<_, Option<f64>>(7)?.unwrap_or(max_x),
                min_y: row.get::<_, Option<f64>>(8)?.unwrap_or(min_y),
                max_y: row.get::<_, Option<f64>>(9)?.unwrap_or(max_y),
            })
        },
    )?;

    let mut result = Vec::new();
    for feat in rows.flatten() {
        result.push(feat);
    }
    Ok(result)
}

/// Tính toán Bbox theo độ (lon/lat - EPSG:4326) của một Tile (Z, X, Y).
pub fn tile_bounds(z: u32, x: u32, y: u32) -> (f64, f64, f64, f64) {
    let n = 2.0_f64.powi(z as i32);
    let min_x = x as f64 / n * 360.0 - 180.0;
    let max_x = (x + 1) as f64 / n * 360.0 - 180.0;
    let max_y = (1.0 - 2.0 * y as f64 / n).atan().sinh().to_degrees();
    let min_y = (1.0 - 2.0 * (y + 1) as f64 / n).atan().sinh().to_degrees();
    (min_x, max_x, min_y, max_y)
}
