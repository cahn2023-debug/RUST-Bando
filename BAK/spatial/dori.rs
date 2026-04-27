use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DoriDistance {
    pub identify: f64,
    pub recognize: f64,
    pub observe: f64,
    pub detect: f64,
}

pub struct DoriLogic;

impl DoriLogic {
    pub fn calculate_distances(
        focal_length: f64,
        sensor_width: f64,
        resolution_x: f64,
    ) -> DoriDistance {
        // PPM (Pixels Per Meter) standard:
        // Identify: 250 ppm, Recognize: 125 ppm, Observe: 62 ppm, Detect: 25 ppm

        let calculate = |ppm: f64| -> f64 { (resolution_x * focal_length) / (ppm * sensor_width) };

        DoriDistance {
            identify: calculate(250.0),
            recognize: calculate(125.0),
            observe: calculate(62.0),
            detect: calculate(25.0),
        }
    }
}
