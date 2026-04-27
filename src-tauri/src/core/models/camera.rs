use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CameraSpecs {
    pub resolution_width: f32,
    pub focal_length: f32,
    pub sensor_width: f32,
}

pub trait CameraModel {
    fn get_specs(&self) -> CameraSpecs;
    fn calculate_fov(&self) -> f64;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StandardCamera {
    pub specs: CameraSpecs,
}

impl CameraModel for StandardCamera {
    fn get_specs(&self) -> CameraSpecs {
        self.specs.clone()
    }

    fn calculate_fov(&self) -> f64 {
        (2.0 * (self.specs.sensor_width as f64 / (2.0 * self.specs.focal_length as f64)).atan())
            .to_degrees()
    }
}
