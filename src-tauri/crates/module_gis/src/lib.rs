use anyhow::{anyhow, Result};
use app_domain::{CameraSpecs, DoriDistances, Point};
use async_trait::async_trait;
use base64::{engine::general_purpose, Engine as _};
use geo::Destination;
use geo::Geodesic;
use hmac::{Hmac, Mac};
use sha1::Sha1;

pub struct GisService;

impl GisService {
    pub fn calculate_ppm(
        specs: &CameraSpecs,
        distance: f64,
    ) -> f64 {
        if distance <= 0.0 {
            return 0.0;
        }
        
        let hfov_rad: f64 = 2.0 * (specs.sensor_width as f64 / (2.0 * specs.focal_length as f64)).atan();
        let height_diff = (specs.install_height - specs.target_height).max(0.0) as f64;
        let slant_range = (distance.powi(2) + height_diff.powi(2)).sqrt();
        
        let field_width = 2.0 * slant_range * (hfov_rad / 2.0).tan();
        if field_width <= 0.0 {
            return 0.0;
        }
        
        specs.resolution_width as f64 / field_width
    }

    pub fn calculate_dori_distances(specs: &CameraSpecs) -> DoriDistances {
        let hfov_rad: f64 = 2.0 * (specs.sensor_width as f64 / (2.0 * specs.focal_length as f64)).atan();
        let hfov_deg = hfov_rad.to_degrees();

        let base = (specs.resolution_width as f64 * specs.focal_length as f64) / specs.sensor_width as f64;

        let get_ground_dist = |slant_range: f64| -> f64 {
            let height_diff = (specs.install_height - specs.target_height).max(0.0) as f64;
            if slant_range > height_diff {
                (slant_range.powi(2) - height_diff.powi(2)).sqrt()
            } else {
                0.0
            }
        };

        DoriDistances {
            identify: get_ground_dist(base / 250.0),
            recognize: get_ground_dist(base / 125.0),
            observe: get_ground_dist(base / 63.0),
            detect: get_ground_dist(base / 25.0),
            hfov: hfov_deg,
        }
    }

    pub fn generate_dori_sector(
        center: Point,
        heading_deg: f64,
        fov_deg: f64,
        radius: f64,
        segments: usize,
    ) -> Vec<Point> {
        let mut points = vec![center.clone()];
        let start_angle = heading_deg - (fov_deg / 2.0);

        for i in 0..=segments {
            let angle_deg = start_angle + (fov_deg * i as f64 / segments as f64);
            let start = geo::Point::new(center.x as f64, center.y as f64);
            let dest = Geodesic::destination(start, angle_deg, radius);

            points.push(Point {
                x: dest.x() as f64,
                y: dest.y() as f64,
            });
        }

        points.push(center);
        points
    }

    pub fn map_rotation_to_heading(rotation: f64) -> f64 {
        (90.0 - rotation + 360.0) % 360.0
    }

    pub fn sign_streetview_url(url_to_sign: String, secret: String) -> Result<String> {
        if secret.is_empty() {
            return Ok(url_to_sign);
        }

        let url = url::Url::parse(&url_to_sign).map_err(|e| anyhow!(e.to_string()))?;
        let path_and_query = format!("{}?{}", url.path(), url.query().unwrap_or(""));

        let decoded_secret = general_purpose::URL_SAFE
            .decode(secret.replace('-', "+").replace('_', "/"))
            .or_else(|_| general_purpose::STANDARD.decode(&secret))
            .map_err(|_| anyhow!("Invalid base64 secret"))?;

        type HmacSha1 = Hmac<Sha1>;
        let mut mac = HmacSha1::new_from_slice(&decoded_secret)
            .map_err(|e| anyhow!("HMAC initialization failed: {}", e))?;
        mac.update(path_and_query.as_bytes());
        let result = mac.finalize();
        let encoded_signature = general_purpose::URL_SAFE.encode(result.into_bytes());

        Ok(format!("{}&signature={}", url_to_sign, encoded_signature))
    }
}

#[async_trait]
impl app_domain::GisProcessor for GisService {
    async fn calculate_area(&self, _data: &app_domain::MapData) -> Result<f64> {
        Ok(0.0)
    }

    async fn apply_delta(
        &self,
        _current: &mut app_domain::MapData,
        _delta: app_domain::DeltaMapData,
    ) -> Result<()> {
        Ok(())
    }
}
