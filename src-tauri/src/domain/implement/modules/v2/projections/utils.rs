/// VN2000 Coordinate Transformation Utilities
/// Reference: "Vietnam National Coordinate System (VN-2000)"
pub struct Vn2000;

impl Vn2000 {
    /// Transforms VN2000 (TM) coordinates to WGS84 (EPSG:4326) Decimal Degrees.
    /// Default Central Meridian (CM) is 105.0 (Hanoi zone).
    /// Scale factor k0 = 0.9999 (common for 3-degree zones in VN2000).
    pub fn to_wgs84(x: f64, y: f64, central_meridian: f64) -> (f64, f64) {
        let a = 6378137.0;
        let f = 1.0 / 298.257223563;
        let b = a * (1.0 - f);
        let e2: f64 = (a * a - b * b) / (a * a);
        let ep2: f64 = (a * a - b * b) / (b * b);
        let k0 = 0.9999;
        let fe = 500000.0;

        let x_adj = (x - fe) / k0;
        let y_adj = y / k0;

        // Footprint latitude
        let mut flat =
            y_adj / (a * (1.0 - e2 / 4.0 - 3.0 * e2 * e2 / 64.0 - 5.0 * e2.powi(3) / 256.0));
        for _ in 0..5 {
            let m = a
                * ((1.0 - e2 / 4.0 - 3.0 * e2 * e2 / 64.0 - 5.0 * e2.powi(3) / 256.0) * flat
                    - (3.0 * e2 / 8.0 + 3.0 * e2 * e2 / 32.0 + 45.0 * e2.powi(3) / 1024.0)
                        * (2.0 * flat).sin()
                    + (15.0 * e2 * e2 / 256.0 + 45.0 * e2.powi(3) / 1024.0) * (4.0 * flat).cos()
                    - (35.0 * e2.powi(3) / 3072.0) * (6.0 * flat).sin());
            flat += (y_adj - m) / a;
        }

        let tan_flat = flat.tan();
        let cos_flat = flat.cos();
        let nu = a / (1.0 - e2 * flat.sin().powi(2)).sqrt();
        let rho = a * (1.0 - e2) / (1.0 - e2 * flat.sin().powi(2)).powf(1.5);
        let eta2 = ep2 * cos_flat * cos_flat;

        let lat = flat - (tan_flat * x_adj * x_adj / (2.0 * rho * nu))
            + (tan_flat * x_adj.powi(4) / (24.0 * rho * nu.powi(3)))
                * (5.0 + 3.0 * tan_flat * tan_flat + eta2 - 9.0 * tan_flat * tan_flat * eta2)
            - (tan_flat * x_adj.powi(6) / (720.0 * rho * nu.powi(5)))
                * (61.0 + 90.0 * tan_flat * tan_flat + 45.0 * tan_flat.powi(4));

        let lon_rad = (x_adj / (nu * cos_flat))
            - (x_adj.powi(3) / (6.0 * nu.powi(3) * cos_flat))
                * (1.0 + 2.0 * tan_flat * tan_flat + eta2)
            + (x_adj.powi(5) / (120.0 * nu.powi(5) * cos_flat))
                * (5.0
                    + 28.0 * tan_flat * tan_flat
                    + 24.0 * tan_flat.powi(4)
                    + 6.0 * eta2
                    + 8.0 * tan_flat * tan_flat * eta2);

        (lat.to_degrees(), central_meridian + lon_rad.to_degrees())
    }

    /// Transforms WGS84 (EPSG:4326) to VN2000 (TM) coordinates.
    pub fn to_vn2000(lat: f64, lon: f64, central_meridian: f64) -> (f64, f64) {
        let a = 6378137.0;
        let f = 1.0 / 298.257223563;
        let k0 = 0.9999;
        let fe = 500000.0;

        let phi = lat.to_radians();
        let lambda = lon.to_radians();
        let lambda0 = central_meridian.to_radians();

        let e2 = f * (2.0 - f);
        let ep2 = e2 / (1.0 - e2);

        let n = a / (1.0 - e2 * phi.sin().powi(2)).sqrt();
        let t = phi.tan().powi(2);
        let c = ep2 * phi.cos().powi(2);
        let a_val = (lambda - lambda0) * phi.cos();

        // Meridional distance M
        let m = a
            * ((1.0 - e2 / 4.0 - 3.0 * e2.powi(2) / 64.0 - 5.0 * e2.powi(3) / 256.0) * phi
                - (3.0 * e2 / 8.0 + 3.0 * e2.powi(2) / 32.0 + 45.0 * e2.powi(3) / 1024.0)
                    * (2.0 * phi).sin()
                + (15.0 * e2.powi(2) / 256.0 + 45.0 * e2.powi(3) / 1024.0) * (4.0 * phi).sin()
                - (35.0 * e2.powi(3) / 3072.0) * (6.0 * phi).sin());

        let x = k0
            * n
            * (a_val
                + (1.0 - t + c) * a_val.powi(3) / 6.0
                + (5.0 - 18.0 * t + t.powi(2) + 72.0 * c - 58.0 * ep2) * a_val.powi(5) / 120.0)
            + fe;

        let y = k0
            * (m + n
                * phi.tan()
                * (a_val.powi(2) / 2.0
                    + (5.0 - t + 9.0 * c + 4.0 * c.powi(2)) * a_val.powi(4) / 24.0
                    + (61.0 - 58.0 * t + t.powi(2) + 600.0 * c - 330.0 * ep2) * a_val.powi(6)
                        / 720.0));

        (x, y)
    }

    /// Auto-detects and transforms coordinates if they look like VN2000 (meters).
    pub fn auto_transform(x: f64, y: f64) -> (f64, f64) {
        if x.abs() < 200.0 && y.abs() < 90.0 {
            (y, x)
        } else {
            Self::to_wgs84(x, y, 105.0)
        }
    }
}
