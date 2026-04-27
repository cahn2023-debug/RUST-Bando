#[cfg(feature = "ai")]
extern crate ndarray;

#[cfg(feature = "ai")]
use ort::session::Session;
#[cfg(feature = "ai")]
use std::path::Path;
use std::sync::{Arc, Mutex};
#[cfg(feature = "ai")]
use tokenizers::Tokenizer;

pub struct EmbeddingEngine {
    session: Arc<Mutex<Session>>,
    tokenizer: Tokenizer,
}

impl EmbeddingEngine {
    pub fn new(session: Arc<Mutex<Session>>, tokenizer: Tokenizer) -> Self {
        Self { session, tokenizer }
    }

    pub fn get_embeddings(&self, text: &str) -> std::result::Result<Vec<f32>, String> {
        let encoding = self
            .tokenizer
            .encode(text, true)
            .map_err(|e| e.to_string())?;

        let ids: Vec<i64> = encoding.get_ids().iter().map(|&id| id as i64).collect();
        let mask: Vec<i64> = encoding
            .get_attention_mask()
            .iter()
            .map(|&m| m as i64)
            .collect();
        let type_ids: Vec<i64> = encoding.get_type_ids().iter().map(|&t| t as i64).collect();

        let seq_len = ids.len();

        let ids_array =
            ndarray::Array2::<i64>::from_shape_vec((1, seq_len), ids).map_err(|e| e.to_string())?;
        let mask_array = ndarray::Array2::<i64>::from_shape_vec((1, seq_len), mask)
            .map_err(|e| e.to_string())?;
        let type_ids_array = ndarray::Array2::<i64>::from_shape_vec((1, seq_len), type_ids)
            .map_err(|e| e.to_string())?;

        let ids_tensor =
            ort::value::Value::from_array(ids_array).map_err(|e: ort::Error| e.to_string())?;
        let mask_tensor =
            ort::value::Value::from_array(mask_array).map_err(|e: ort::Error| e.to_string())?;
        let type_ids_tensor =
            ort::value::Value::from_array(type_ids_array).map_err(|e: ort::Error| e.to_string())?;

        let mut session = self.session.lock().map_err(|e| e.to_string())?;
        let outputs = session
            .run(ort::inputs![
                "input_ids" => ids_tensor,
                "attention_mask" => mask_tensor,
                "token_type_ids" => type_ids_tensor,
            ])
            .map_err(|e: ort::Error| e.to_string())?;

        let output = outputs
            .get("last_hidden_state")
            .ok_or_else(|| "Failed to get last_hidden_state from Embedding model".to_string())?;

        let extract = output
            .try_extract_tensor::<f32>()
            .map_err(|e: ort::Error| e.to_string())?;
        let view = ndarray::ArrayView3::from_shape((1, seq_len, 384), extract.1)
            .map_err(|e| e.to_string())?;
        let mut embedding = vec![0.0; view.shape()[2]];
        for i in 0..view.shape()[1] {
            for j in 0..view.shape()[2] {
                embedding[j] += view[[0, i, j]];
            }
        }
        for val in embedding.iter_mut() {
            *val /= view.shape()[1] as f32;
        }

        Ok(embedding)
    }
}

pub fn get_tokenizer(path: &Path) -> Result<Tokenizer, String> {
    Tokenizer::from_file(path).map_err(|e| e.to_string())
}

pub struct EmbeddingManager {
    engine: Option<EmbeddingEngine>,
    session: Option<Arc<Mutex<Session>>>,
}

impl EmbeddingManager {
    pub fn new() -> Self {
        Self {
            engine: None,
            session: None,
        }
    }

    pub fn init(&mut self, session: Arc<Mutex<Session>>, tokenizer: Tokenizer) {
        self.engine = Some(EmbeddingEngine::new(Arc::clone(&session), tokenizer));
        self.session = Some(session);
    }

    pub fn get_engine(&self) -> Result<&EmbeddingEngine, String> {
        self.engine
            .as_ref()
            .ok_or("Embedding Engine not initialized".to_string())
    }
}
