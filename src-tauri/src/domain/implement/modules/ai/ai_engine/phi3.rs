use std::sync::Arc;
use tokenizers::Tokenizer;

pub struct Phi3Engine {
    session: Arc<std::sync::Mutex<ort::session::Session>>,
    tokenizer: Tokenizer,
}

impl Phi3Engine {
    pub fn new(
        session: Arc<std::sync::Mutex<ort::session::Session>>,
        tokenizer: Tokenizer,
    ) -> Self {
        Self { session, tokenizer }
    }

    pub fn generate(&self, prompt: &str, max_tokens: usize) -> anyhow::Result<String> {
        let encoding = self
            .tokenizer
            .encode(prompt, true)
            .map_err(|e| anyhow::anyhow!("Tokenization failed: {}", e))?;

        let mut tokens: Vec<i64> = encoding.get_ids().iter().map(|&id| id as i64).collect();
        let mut generated_text = String::new();

        let mut session = self
            .session
            .lock()
            .map_err(|e| anyhow::anyhow!(e.to_string()))?;

        // 🧠 KV Cache state: Mapping input names to their tensor values
        let mut kv_cache: Option<std::collections::HashMap<String, ort::value::Value>> = None;

        for _ in 0..max_tokens {
            let seq_len = if kv_cache.is_some() { 1 } else { tokens.len() };
            let current_tokens = if kv_cache.is_some() {
                vec![*tokens.last().unwrap()]
            } else {
                tokens.clone()
            };

            let array = ndarray::Array2::from_shape_vec((1, seq_len), current_tokens)
                .map_err(|e| anyhow::anyhow!("Failed to create ndarray: {}", e))?;

            let input_tensor = ort::value::Value::from_array(array)
                .map_err(|e: ort::Error| anyhow::anyhow!(e.to_string()))?;

            // Prepare inputs
            let mut inputs = ort::inputs!["input_ids" => input_tensor]?;

            // Add KV Cache inputs if present
            if let Some(ref cache) = kv_cache {
                for (name, value) in cache {
                    inputs.insert(name.as_str(), value.view());
                }
            }

            let outputs = session
                .run(inputs)
                .map_err(|e: ort::Error| anyhow::anyhow!("Inference failed: {}", e))?;

            // Update KV Cache from outputs
            let mut next_cache = std::collections::HashMap::new();
            for (name, value) in outputs.iter() {
                if name.starts_with("present") {
                    let input_name = name.replace("present", "past_key_values");
                    next_cache.insert(input_name, value.try_clone()?);
                }
            }
            kv_cache = Some(next_cache);

            // Extract logits and pick the next token
            let logits = outputs["logits"].try_extract_tensor::<f32>()?;
            let next_token = self.sample_greedy(&logits);

            tokens.push(next_token as i64);

            let decoded = self
                .tokenizer
                .decode(&[next_token], true)
                .map_err(|e| anyhow::anyhow!("Decoding failed: {}", e))?;

            if decoded.contains("<|endoftext|>")
                || decoded.contains("<|im_end|>")
                || decoded.contains("<|end|>")
            {
                break;
            }

            generated_text.push_str(&decoded);
        }

        Ok(generated_text)
    }

    fn sample_greedy(&self, logits: &ndarray::ArrayViewD<f32>) -> u32 {
        // Simple greedy sampling: pick the index with max logit in the last position
        let last_step_logits = logits.slice(ndarray::s![0, -1, ..]);
        let mut max_val = f32::NEG_INFINITY;
        let mut max_idx = 0;
        for (idx, &val) in last_step_logits.iter().enumerate() {
            if val > max_val {
                max_val = val;
                max_idx = idx;
            }
        }
        max_idx as u32
    }

    pub fn predict_rotation(
        &self,
        feature_info: &str,
        geometry_hint: f64,
    ) -> anyhow::Result<String> {
        // Create a structured prompt for rotation prediction
        let prompt = format!(
            r#"You are a design layout assistant. Given the following feature information and geometry hint, predict the optimal rotation angle.

Feature Information: {}
Geometry Hint (aspect ratio or angle): {:.2}

Return ONLY a valid JSON object with this exact format:
{{"angle": <number in degrees>, "confidence": <number between 0 and 1>}}

Example response: {{"angle": 90.0, "confidence": 0.85}}

Do NOT include any explanation. Return ONLY the JSON:"#,
            feature_info,
            geometry_hint
        );

        // Generate response using the LLM
        let response = self.generate(&prompt, 128)?;

        // Parse JSON from response
        self.parse_rotation_response(&response)
    }

    fn parse_rotation_response(&self, response: &str) -> anyhow::Result<String> {
        // Try to extract JSON from the response
        let json_start = response.find('{');
        let json_end = response.rfind('}');

        if let (Some(start), Some(end)) = (json_start, json_end) {
            let json_str = &response[start..=end];
            
            // Validate JSON structure
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(json_str) {
                if let Some(angle) = value.get("angle").and_then(|v| v.as_f64()) {
                    if let Some(confidence) = value.get("confidence").and_then(|v| v.as_f64()) {
                        // Validate ranges
                        if (0.0..=360.0).contains(&angle) && (0.0..=1.0).contains(&confidence) {
                            return Ok(json_str.to_string());
                        }
                    }
                }
            }
        }

        // Fallback to default if parsing fails
        log::warn!("Failed to parse rotation response: {}", response);
        Ok("{\"angle\": 0.0, \"confidence\": 0.0}".to_string())
    }

    pub fn analyze_contract(&self, text: &str) -> anyhow::Result<String> {
        let prompt = format!("Analyze this contract and return JSON metadata: {}", text);
        self.generate(&prompt, 1024)
    }
}
