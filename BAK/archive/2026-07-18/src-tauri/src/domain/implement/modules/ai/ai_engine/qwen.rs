use std::sync::Arc;
use tokenizers::Tokenizer;

pub struct QwenEngine {
    session: Arc<std::sync::Mutex<ort::session::Session>>,
    tokenizer: Tokenizer,
}

impl QwenEngine {
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

            // Qwen end tokens: <|endoftext|>, <|im_end|>, <|endofprompt|>
            if decoded.contains("<|endoftext|>")
                || decoded.contains("<|im_end|>")
                || decoded.contains("<|endofprompt|>")
            {
                break;
            }

            generated_text.push_str(&decoded);
        }

        Ok(generated_text)
    }

    fn sample_greedy(&self, logits: &ndarray::ArrayViewD<f32>) -> u32 {
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
}
