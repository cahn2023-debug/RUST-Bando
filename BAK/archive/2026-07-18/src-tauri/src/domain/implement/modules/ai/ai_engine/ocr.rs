#[cfg(feature = "ai")]
use anyhow::Result;
#[cfg(feature = "ai")]
use ort::session::Session;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

#[derive(Debug, Serialize, Deserialize)]
pub struct OcrResult {
    pub text: String,
    pub confidence: f32,
}

#[cfg(feature = "ai")]
pub struct OcrEngine {
    _detector: Arc<Mutex<Session>>,
    _recognizer: Arc<Mutex<Session>>,
}

#[cfg(feature = "ai")]
impl OcrEngine {
    pub fn new(detector: Arc<Mutex<Session>>, recognizer: Arc<Mutex<Session>>) -> Self {
        Self {
            _detector: detector,
            _recognizer: recognizer,
        }
    }

    pub fn process_region(&self, region_bytes: Vec<u8>) -> Result<OcrResult> {
        use ort::session::SessionInputs;
        use std::collections::HashMap;

        // Decode image from bytes
        let img = image::load_from_memory(&region_bytes)
            .map_err(|e| anyhow::anyhow!("Failed to load image: {}", e))?;

        // Preprocess image for detector (text region detection)
        let detector_input = self.prepare_image_for_detector(&img)?;

        // Run text detection
        let detector_session = self
            ._detector
            .lock()
            .map_err(|e| anyhow::anyhow!("Lock poisoned: {}", e))?;
        let detector_outputs = detector_session.run(SessionInputs::from_iter([(
            "input".to_string(),
            ort::value::Value::from_array(detector_input)?,
        )]))?;

        // Extract text regions from detector output
        let text_regions = self.extract_text_regions(&detector_outputs, &img)?;

        // Process each region with recognizer
        let recognizer_session = self
            ._recognizer
            .lock()
            .map_err(|e| anyhow::anyhow!("Lock poisoned: {}", e))?;
        let mut all_text = String::new();
        let mut total_confidence = 0.0;
        let mut region_count = 0;

        for region in text_regions {
            // Preprocess region for recognition
            let recognizer_input = self.prepare_image_for_recognizer(&region)?;

            // Run text recognition
            let recognizer_outputs = recognizer_session.run(SessionInputs::from_iter([(
                "input".to_string(),
                ort::value::Value::from_array(recognizer_input)?,
            )]))?;

            // Decode text from recognizer output
            let (text, confidence) = self.decode_text_from_output(&recognizer_outputs)?;

            if !text.trim().is_empty() {
                if !all_text.is_empty() {
                    all_text.push(' ');
                }
                all_text.push_str(&text);
                total_confidence += confidence;
                region_count += 1;
            }
        }

        let avg_confidence = if region_count > 0 {
            total_confidence / region_count as f32
        } else {
            0.0
        };

        Ok(OcrResult {
            text: all_text,
            confidence: avg_confidence,
        })
    }

    fn prepare_image_for_detector(
        &self,
        img: &image::DynamicImage,
    ) -> Result<ndarray::Array4<f32>> {
        // Resize to detector input size (e.g., 640x640)
        let resized = img.resize_exact(640, 640, image::imageops::FilterType::Lanczos3);
        let rgb = resized.to_rgb8();

        // Convert to NCHW format (batch=1, channels=3, height=640, width=640)
        let mut array = ndarray::Array4::zeros((1, 3, 640, 640));
        for (x, y, pixel) in rgb.enumerate_pixels() {
            array[[0, 0, y, x]] = pixel[0] as f32 / 255.0; // R
            array[[0, 1, y, x]] = pixel[1] as f32 / 255.0; // G
            array[[0, 2, y, x]] = pixel[2] as f32 / 255.0; // B
        }

        Ok(array)
    }

    fn prepare_image_for_recognizer(
        &self,
        img: &image::DynamicImage,
    ) -> Result<ndarray::Array4<f32>> {
        // Resize to recognizer input size (e.g., 100x32 for text recognition)
        let resized = img.resize_exact(100, 32, image::imageops::FilterType::Lanczos3);
        let gray = resized.to_luma8();

        // Convert to NCHW format (batch=1, channels=1, height=32, width=100)
        let mut array = ndarray::Array4::zeros((1, 1, 32, 100));
        for (x, y, pixel) in gray.enumerate_pixels() {
            array[[0, 0, y, x]] = pixel[0] as f32 / 255.0;
        }

        Ok(array)
    }

    fn extract_text_regions(
        &self,
        outputs: &ort::session::SessionOutputs,
        img: &image::DynamicImage,
    ) -> Result<Vec<image::DynamicImage>> {
        let mut regions = Vec::new();

        // Extract the probability map (assumed to be the first output)
        let binding = outputs
            .get("output")
            .or_else(|| outputs.get("heatmap"))
            .ok_or_else(|| anyhow::anyhow!("No output tensor found"))?;
        let output_tensor = binding.try_extract_tensor::<f32>()?;

        // Shape: [batch, channels, height, width] - typically [1, 1, 640, 640]
        let shape = output_tensor.shape();
        if shape.len() < 4 {
            return Ok(vec![img.clone()]);
        }

        let height = shape[2];
        let width = shape[3];
        let threshold = 0.3f32;

        // Simple region extraction: find bounding boxes of connected components
        // In a real production app, we would use imageproc or similar for this.
        // For now, we return at least one region if the image has text.

        let mut has_text = false;
        for y in 0..height {
            for x in 0..width {
                if output_tensor[[0, 0, y, x]] > threshold {
                    has_text = true;
                    break;
                }
            }
            if has_text {
                break;
            }
        }

        if has_text {
            regions.push(img.clone());
        }

        Ok(regions)
    }

    fn decode_text_from_output(
        &self,
        outputs: &ort::session::SessionOutputs,
    ) -> Result<(String, f32)> {
        let binding = outputs
            .get("output")
            .or_else(|| outputs.get("logits"))
            .ok_or_else(|| anyhow::anyhow!("No output tensor found"))?;
        let logits_tensor = binding.try_extract_tensor::<f32>()?;

        let shape = logits_tensor.shape(); // typically [batch, seq_len, char_count]
        if shape.len() < 3 {
            return Ok(("".to_string(), 0.0));
        }

        let seq_len = shape[1];
        let char_count = shape[2];

        let mut text = String::new();
        let mut total_prob = 0.0;
        let mut prev_char_idx = -1;

        // Simple greedy CTC decoding (argmax)
        // char_map: 0-25 for a-z, etc.
        let chars = "abcdefghijklmnopqrstuvwxyz0123456789 ";

        for t in 0..seq_len {
            let mut max_prob = -1.0;
            let mut max_idx = -1;

            for c in 0..char_count {
                let prob = logits_tensor[[0, t, c]];
                if prob > max_prob {
                    max_prob = prob;
                    max_idx = c as i32;
                }
            }

            // max_idx == 0 is typically the blank character in CTC
            if max_idx > 0 && max_idx != prev_char_idx {
                let char_idx = (max_idx - 1) as usize;
                if char_idx < chars.len() {
                    text.push(chars.chars().nth(char_idx).unwrap());
                }
                total_prob += max_prob;
            }
            prev_char_idx = max_idx;
        }

        let avg_confidence = if !text.is_empty() {
            total_prob / text.len() as f32
        } else {
            0.0
        };

        Ok((text, avg_confidence))
    }
}

#[cfg(feature = "ai")]
pub struct OCRManager {
    engine: Option<OcrEngine>,
    session_det: Option<Arc<Mutex<Session>>>,
    session_rec: Option<Arc<Mutex<Session>>>,
}

#[cfg(feature = "ai")]
impl OCRManager {
    pub fn new() -> Self {
        Self {
            engine: None,
            session_det: None,
            session_rec: None,
        }
    }

    pub fn init(&mut self, detector: Arc<Mutex<Session>>, recognizer: Arc<Mutex<Session>>) {
        self.engine = Some(OcrEngine::new(
            Arc::clone(&detector),
            Arc::clone(&recognizer),
        ));
        self.session_det = Some(detector);
        self.session_rec = Some(recognizer);
    }

    pub fn get_engine(&self) -> Result<&OcrEngine, String> {
        self.engine
            .as_ref()
            .ok_or("OCR Engine not initialized".to_string())
    }
}
