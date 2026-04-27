use std::f64::consts::PI;

/// Web Mercator tile index calculation.
/// Implementation based on: https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames
pub struct TileIndexer;

impl TileIndexer {
    /// Gets the Tile ID for a given latitude, longitude, and zoom level.
    /// Format: {zoom}_{x}_{y}
    pub fn get_tile_id(lat: f64, lon: f64, zoom: u8) -> String {
        let n = 2.0f64.powi(zoom as i32);
        
        // Calculate X tile index
        let x = ((lon + 180.0) / 360.0) * n;
        
        // Calculate Y tile index
        let lat_rad = lat.to_radians();
        let y = (1.0 - (lat_rad.tan() + (1.0 / lat_rad.cos())).ln() / PI) / 2.0 * n;
        
        format!("{}_{}_{}", zoom, x.floor() as i64, y.floor() as i64)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tile_id_hanoi() {
        // Hanoi, Vietnam approx: 21.0285, 105.8542
        // Zoom 16
        let tile_id = TileIndexer::get_tile_id(21.0285, 105.8542, 16);
        println!("Hanoi Tile ID (Z16): {}", tile_id);
        
        // Basic format check
        assert!(tile_id.starts_with("16_"));
        assert_eq!(tile_id.split('_').count(), 3);
    }

    #[test]
    fn test_tile_id_equator() {
        let tile_id = TileIndexer::get_tile_id(0.0, 0.0, 16);
        assert_eq!(tile_id, "16_32768_32768");
    }
}
