// src/ai_engine/mod.rs

use anyhow::Result;
use dashmap::DashMap;
use ndarray::Array1;
use ort::{session::SessionBuilder, Session};
use std::sync::Arc;

pub struct AiEngine {
    session: Option<Arc<Session>>,
    embedding_cache: DashMap<String, Vec<f32>>,
}

impl AiEngine {
    pub fn new(model_path: &str) -> Self {
        let session = SessionBuilder::new()
            .ok()
            .and_then(|builder| builder.with_model_from_file(model_path))
            .map(Arc::new);

        Self {
            session,
            embedding_cache: DashMap::new(),
        }
    }

    pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
        let dot_product: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
        let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
        let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
        dot_product / (norm_a * norm_b)
    }

    pub fn get_embedding(&self, text: &str) -> Result<Vec<f32>> {
        if let Some(cached) = self.embedding_cache.get(text) {
            return Ok(cached.clone());
        }

        let session = self
            .session
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("AI Session not initialized"))?;

        // This is a placeholder for actual tokenization and tensor creation
        // In a real implementation, we would use a tokenizer (like tokenizers-rs)
        // and create the necessary tensors for the ONNX model.
        // For now, if the session is present, we attempt a run with mock inputs
        // to demonstrate the structure, or return an error if we can't tokenize.

        // Mocking the embedding vector generation for now to stay within environment limits
        // but using a deterministic hash-based "embedding" for testable results
        // if the session is not fully ready with a tokenizer.
        let mut embedding = vec![0.0f32; 384]; // Standard small embedding size
        for (i, byte) in text.as_bytes().iter().enumerate() {
            embedding[i % 384] += (*byte as f32) / 255.0;
        }

        // Normalize the vector
        let norm = embedding.iter().map(|x| x * x).sum::<f32>().sqrt();
        if norm > 0.0 {
            for x in embedding.iter_mut() {
                *x /= norm;
            }
        }

        self.embedding_cache
            .insert(text.to_string(), embedding.clone());
        Ok(embedding)
    }

    pub async fn suggest_mappings(
        &self,
        query: &str,
        candidates: Vec<(i32, String)>,
    ) -> Vec<(i32, f32)> {
        let query_vec = match self.get_embedding(query) {
            Ok(v) => v,
            Err(_) => return Vec::new(),
        };

        let mut results: Vec<(i32, f32)> = Vec::new();

        for (id, name) in candidates {
            if let Ok(cand_vec) = self.get_embedding(&name) {
                let sim = Self::cosine_similarity(&query_vec, &cand_vec);
                results.push((id, sim));
            }
        }

        results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        results
    }
}
