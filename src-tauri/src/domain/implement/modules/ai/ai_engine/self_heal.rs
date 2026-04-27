use super::phi3::Phi3Engine;
use log::{info, warn};
use serde::{Deserialize, Serialize};
use serde_json::from_str;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RotationResponse {
    pub angle: f64,
    pub confidence: f32,
    pub reason: Option<String>,
}

pub struct SelfHEAL {
    engine: Phi3Engine,
}

impl SelfHEAL {
    pub fn new(engine: Phi3Engine) -> Self {
        Self { engine }
    }

    /// Predict camera rotation with automatic verification and correction.
    /// geometry_hint is the angle calculated by our SIMD Math Engine.
    pub fn predict_camera_rotation(
        &mut self,
        feature_info: &str,
        geometry_hint: f64,
    ) -> anyhow::Result<RotationResponse> {
        // Pass 1: Standard AI Prediction
        let ai_result_raw = self.engine.predict_rotation(feature_info, geometry_hint)?;

        let mut response = self.parse_and_validate(&ai_result_raw)?;

        // Pass 2: Verification against Geometry SIMD Engine
        // If AI disagrees with math by > 15 degrees, we trigger HEAL
        let diff = (response.angle - geometry_hint).abs();
        let normalized_diff = if diff > 180.0 { 360.0 - diff } else { diff };

        if normalized_diff > 15.0 && response.confidence < 0.99 {
            warn!(
                "[Self-HEAL] AI suggested {:.1}°, but Math says {:.1}°. Difference: {:.1}°. Retrying with HEAL...",
                response.angle, geometry_hint, normalized_diff
            );

            // HEAL: Retry with correction prompt
            let heal_prompt = format!(
                "<|im_start|>system\nYou are an AI validator. Your previous suggestion was {:.1}°, but geometrical analysis indicates {:.1}°. \
                Re-evaluate based on this hint and return the CORRECT angle in JSON.<|im_end|>\n\
                <|im_start|>user\nContext: {}\n<|im_end|>\n<|im_start|>assistant\n",
                response.angle, geometry_hint, feature_info
            );

            let healed_raw = self
                .engine
                .generate(&heal_prompt, 128)
                .map_err(|e| anyhow::anyhow!("HEAL pass failed: {}", e))?;

            let healed_response = self.parse_and_validate(&healed_raw)?;

            info!(
                "[Self-HEAL] Correction successful. New angle: {:.1}°, confidence: {:.2}",
                healed_response.angle, healed_response.confidence
            );

            response = healed_response;
        } else {
            info!(
                "[Self-HEAL] AI Prediction verified. Angle: {:.1}°, Math Match: {:.1}°",
                response.angle, geometry_hint
            );
        }

        Ok(response)
    }

    fn parse_and_validate(&self, raw_json: &str) -> anyhow::Result<RotationResponse> {
        // Strip potential markdown markers if AI hallucinates them
        let clean_json = raw_json
            .trim()
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim();

        let res: RotationResponse = from_str(clean_json)
            .map_err(|e| anyhow::anyhow!("AI JSON parse error: {}. Raw: {}", e, raw_json))?;

        // Ensure angle is 0-360
        let mut angle = res.angle % 360.0;
        if angle < 0.0 {
            angle += 360.0;
        }

        Ok(RotationResponse { angle, ..res })
    }
}
