use std::future::Future;
use std::pin::Pin;
use std::path::PathBuf;
use crate::domain::implement::modules::v2::pipeline::actor_system::Actor;
use crate::domain::implement::modules::ai::ai_engine::AIManager;
use anyhow::Result;

#[derive(Debug, Clone)]
pub enum AiMessage {
    GetEmbedding { text: String },
    Chat { prompt: String, model: String },
    Ocr { image_path: PathBuf },
    GetStatus,
}

#[derive(Debug, Clone)]
pub enum AiResponse {
    Embedding(Vec<f32>),
    Chat(String),
    Ocr(Vec<String>),
    Status(std::collections::HashMap<String, bool>),
    Error(String),
}

pub struct AiActor {
    manager: AIManager,
}

impl AiActor {
    pub fn new() -> Self {
        Self {
            manager: AIManager::new(),
        }
    }
}

impl Actor for AiActor {
    type Message = AiMessage;
    type Response = AiResponse;

    fn name(&self) -> &str {
        "AiActor"
    }

    fn handle(
        &mut self,
        msg: Self::Message,
    ) -> Pin<Box<dyn Future<Output = Option<Self::Response>> + Send>> {
        let manager = self.manager.clone();
        
        Box::pin(async move {
            match msg {
                AiMessage::GetEmbedding { text } => {
                    match manager.get_embedding_engine() {
                        Ok(engine) => {
                            match engine.get_embeddings(&text) {
                                Ok(embedding) => Some(AiResponse::Embedding(embedding)),
                                Err(e) => Some(AiResponse::Error(e)),
                            }
                        }
                        Err(e) => Some(AiResponse::Error(e.to_string())),
                    }
                }
                AiMessage::Chat { prompt, model } => {
                    if model.contains("phi") {
                        match manager.get_phi3_engine() {
                            Ok(engine) => {
                                match engine.generate(&prompt, 512) {
                                    Ok(res) => Some(AiResponse::Chat(res)),
                                    Err(e) => Some(AiResponse::Error(e.to_string())),
                                }
                            }
                            Err(e) => Some(AiResponse::Error(e.to_string())),
                        }
                    } else {
                        match manager.get_qwen_engine() {
                            Ok(engine) => {
                                match engine.generate(&prompt, 512) {
                                    Ok(res) => Some(AiResponse::Chat(res)),
                                    Err(e) => Some(AiResponse::Error(e.to_string())),
                                }
                            }
                            Err(e) => Some(AiResponse::Error(e.to_string())),
                        }
                    }
                }
                AiMessage::Ocr { image_path } => {
                    match manager.get_ocr_engine() {
                        Ok(engine) => {
                            match engine.extract_text(&image_path) {
                                Ok(res) => Some(AiResponse::Ocr(res)),
                                Err(e) => Some(AiResponse::Error(e.to_string())),
                            }
                        }
                        Err(e) => Some(AiResponse::Error(e.to_string())),
                    }
                }
                AiMessage::GetStatus => {
                    let mut status = std::collections::HashMap::new();
                    status.insert("phi3_loaded".to_string(), manager.is_phi3_loaded());
                    status.insert("embedding_loaded".to_string(), manager.is_embedding_loaded());
                    status.insert("ocr_loaded".to_string(), manager.is_ocr_loaded());
                    Some(AiResponse::Status(status))
                }
            }
        })
    }
}
