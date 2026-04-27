use ort::session::Session;
use ort::value::Value;
use std::sync::{Arc, Mutex};

pub struct YoloEngine {
    session: Arc<Mutex<Session>>,
}

impl YoloEngine {
    pub fn new(session: Arc<Mutex<ort::session::Session>>) -> Self {
        Self { session }
    }

    pub fn detect(&self, image_data: Vec<f32>, shape: [usize; 4]) -> Result<Vec<f32>, String> {
        let array = ndarray::Array4::<f32>::from_shape_vec(shape, image_data)
            .map_err(|e| format!("Failed to create ndarray: {}", e))?;

        let input_tensor = Value::from_array(array).map_err(|e: ort::Error| e.to_string())?;

        let mut session = self.session.lock().map_err(|e| e.to_string())?;
        let outputs = session
            .run(ort::inputs!["images" => input_tensor])
            .map_err(|e: ort::Error| e.to_string())?;

        let output = outputs
            .get("output0")
            .ok_or_else(|| "Failed to get output0 from YOLO".to_string())?;

        let extract = output
            .try_extract_tensor::<f32>()
            .map_err(|e: ort::Error| e.to_string())?;

        Ok(extract.1.to_vec())
    }
}

pub struct YoloManager {
    engine: Option<YoloEngine>,
    session: Option<Arc<Mutex<Session>>>,
}

impl YoloManager {
    pub fn new() -> Self {
        Self {
            engine: None,
            session: None,
        }
    }

    pub fn init(&mut self, session: Arc<Mutex<Session>>) {
        self.engine = Some(YoloEngine::new(Arc::clone(&session)));
        self.session = Some(session);
    }

    pub fn get_engine(&self) -> Result<&YoloEngine, String> {
        self.engine
            .as_ref()
            .ok_or("YOLO Engine not initialized".to_string())
    }
}
