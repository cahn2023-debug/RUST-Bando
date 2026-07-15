use rayon::prelude::*;

/// Tham số Ellipsoid WGS84
const WGS84_A: f64 = 6378137.0;
const WGS84_F: f64 = 1.0 / 298.257223563;

/// Tham số VN2000 (Mặc định cho Việt Nam)
const VN2000_K0: f64 = 0.9999;
const VN2000_FE: f64 = 500000.0;

#[derive(Debug, Clone, Copy, serde::Serialize, serde::Deserialize)]
pub struct LonLat {
    pub lon: f64,
    pub lat: f64,
}

#[derive(Debug, Clone, Copy, serde::Serialize, serde::Deserialize)]
pub struct Vn2000 {
    pub x: f64,
    pub y: f64,
}

/// Chuyển đổi từ WGS84 (Lon/Lat) sang VN2000 (X/Y)
/// CM: Kinh tuyến trục (Central Meridian), ví dụ 105.0
pub fn wgs84_to_vn2000(coords: LonLat, cm: f64) -> Vn2000 {
    let lon = coords.lon.to_radians();
    let lat = coords.lat.to_radians();
    let cm_rad = cm.to_radians();
    
    let b = WGS84_A * (1.0 - WGS84_F);
    let e2 = (WGS84_A.powi(2) - b.powi(2)) / WGS84_A.powi(2);
    // let ep2 = (WGS84_A.powi(2) - b.powi(2)) / b.powi(2);
    
    let n = (WGS84_A - b) / (WGS84_A + b);
    let ap = WGS84_A * (1.0 - n + 5.0 / 4.0 * (n.powi(2) - n.powi(3)) + 81.0 / 64.0 * (n.powi(4) - n.powi(5)));
    let bp = 3.0 / 2.0 * WGS84_A * (n - n.powi(2) + 7.0 / 8.0 * (n.powi(3) - n.powi(4)) + 55.0 / 64.0 * n.powi(5));
    let cp = 15.0 / 16.0 * WGS84_A * (n.powi(2) - n.powi(3) + 3.0 / 4.0 * (n.powi(4) - n.powi(5)));
    let dp = 35.0 / 48.0 * WGS84_A * (n.powi(3) - n.powi(4) + 11.0 / 16.0 * n.powi(5));
    let ep = 315.0 / 512.0 * WGS84_A * (n.powi(4) - n.powi(5));
    
    let s = ap * lat - bp * (2.0 * lat).sin() + cp * (4.0 * lat).sin() - dp * (6.0 * lat).sin() + ep * (8.0 * lat).sin();
    
    let dl = lon - cm_rad;
    let t = lat.tan();
    let t2 = t.powi(2);
    let cl = lat.cos();
    let cl2 = cl.powi(2);
    let v = WGS84_A / (1.0 - e2 * lat.sin().powi(2)).sqrt();
    let psi = v / (v * (1.0 - e2) / (1.0 - e2 * lat.sin().powi(2)));
    
    let x = VN2000_K0 * (s + v * t * cl2 * dl.powi(2) / 2.0 
            + v * t * cl2.powi(2) * (4.0 * psi.powi(2) + psi - t2) * dl.powi(4) / 24.0
            + v * t * cl2.powi(3) * (8.0 * psi.powi(4) * (11.0 - 24.0 * t2) - 28.0 * psi.powi(3) * (1.0 - 6.0 * t2) + psi.powi(2) * (1.0 - 32.0 * t2) - psi * (2.0 * t2) + t2.powi(2)) * dl.powi(6) / 720.0);
            
    let y = VN2000_FE + VN2000_K0 * (v * cl * dl 
            + v * cl2 * cl * (psi - t2) * dl.powi(3) / 6.0
            + v * cl2.powi(2) * cl * (4.0 * psi.powi(3) * (1.0 - 6.0 * t2) + psi.powi(2) * (1.0 + 8.0 * t2) - psi * (2.0 * t2) + t2.powi(2)) * dl.powi(5) / 120.0);
            
    Vn2000 { x, y }
}

/// Chuyển đổi hàng loạt tọa độ WGS84 sang VN2000 sử dụng song song
pub fn batch_wgs84_to_vn2000(coords: &[LonLat], cm: f64) -> Vec<Vn2000> {
    coords.par_iter()
        .map(|&c| wgs84_to_vn2000(c, cm))
        .collect()
}
