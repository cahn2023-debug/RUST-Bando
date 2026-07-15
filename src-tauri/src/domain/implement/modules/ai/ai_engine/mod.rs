use anyhow::{anyhow, Result};
use ort::ep::ExecutionProvider;
use ort::session::Session;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock, RwLock};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AIError {
    #[error("Failed to load model from path: {0}")]
    ModelLoadError(String),
    #[error("Inference failed: {0}")]
    InferenceError(String),
    #[error("Pre-processing failed: {0}")]
    PreProcessingError(String),
    #[error("Post-processing failed: {0}")]
    PostProcessingError(String),
}

#[derive(Default)]
pub struct AIEngine {
    resource_dir: PathBuf,
    data_dir: PathBuf,
    yolo_session: OnceLock<Arc<Mutex<Session>>>,
    ocr_det_session: OnceLock<Arc<Mutex<Session>>>,
    ocr_rec_session: OnceLock<Arc<Mutex<Session>>>,
    embedding_session: OnceLock<Arc<Mutex<Session>>>,
    phi3_session: OnceLock<Arc<Mutex<Session>>>,
    qwen_session: OnceLock<Arc<Mutex<Session>>>,
}

impl AIEngine {
    pub fn new(resource_dir: PathBuf, data_dir: PathBuf) -> Self {
        Self {
            resource_dir,
            data_dir,
            ..Default::default()
        }
    }

    fn resolve_model_path(&self, filename: &str) -> PathBuf {
        // 1. Check in data_dir (for downloaded models)
        let downloaded_path = self.data_dir.join("active_models").join(filename);
        if downloaded_path.exists() {
            return downloaded_path;
        }

        // 2. Check in resource_dir/models (for pre-bundled models)
        let bundled_path = self.resource_dir.join("models").join(filename);
        if bundled_path.exists() {
            return bundled_path;
        }

        // Fallback to bundled path
        bundled_path
    }

    fn get_best_ep(&self) -> ort::execution_providers::ExecutionProviderDispatch {
        // Allow forcing CPU for debugging or low-end hardware stability
        if std::env::var("AI_FORCE_CPU").is_ok() {
            // CPU Execution Provider forced
            return ort::execution_providers::CPUExecutionProvider::default().build();
        }

        // Ưu tiên DirectML trên Windows cho GPU tích hợp
        #[cfg(target_os = "windows")]
        if ort::execution_providers::DirectMLExecutionProvider::default()
            .is_available()
            .unwrap_or(false)
        {
            return ort::execution_providers::DirectMLExecutionProvider::default().build();
        }

        // Ưu tiên CUDA cho NVIDIA
        if ort::execution_providers::CUDAExecutionProvider::default()
            .is_available()
            .unwrap_or(false)
        {
            return ort::execution_providers::CUDAExecutionProvider::default().build();
        }

        // Fallback về CPU
        ort::execution_providers::CPUExecutionProvider::default().build()
    }

    pub fn get_yolo_session(&self) -> Result<Arc<Mutex<Session>>> {
        if let Some(s) = self.yolo_session.get() {
            return Ok(s.clone());
        }
        // Thử tìm model nén trước
        let path = self.resolve_model_path("yolov8n_int8.onnx");
        let path = if path.exists() {
            path
        } else {
            self.resolve_model_path("yolov8n.onnx")
        };

        let session = Session::builder()
            .map_err(|e| anyhow!("Failed to create session builder: {e}"))?
            .with_execution_providers([self.get_best_ep()])
            .map_err(|e| anyhow!("Failed to set EP: {e}"))?
            .commit_from_file(&path)
            .map_err(|e: ort::Error| anyhow!("Failed to load model: {e}"))?;

        let arc_session = Arc::new(Mutex::new(session));
        let _ = self.yolo_session.set(arc_session.clone());
        Ok(arc_session)
    }

    pub fn get_phi3_session(&self) -> Result<Arc<Mutex<Session>>> {
        if let Some(s) = self.phi3_session.get() {
            return Ok(s.clone());
        }
        // Thử tìm model INT4 (nhẹ - ưu tiên cho máy 2GB)
        let path = self.resolve_model_path("llm_int4.onnx");
        let path = if path.exists() {
            path
        } else {
            self.resolve_model_path("llm.onnx")
        };

        // 🚀 Chiến lược nạp "Zero-Failure": Thử GPU trước, nếu lỗi chuyển ngay CPU
        let session_res = Session::builder()
            .map_err(|e| anyhow!("Failed to create LLM builder: {e}"))?
            .with_execution_providers([self.get_best_ep()])
            .map_err(|e| anyhow!("Failed to set EP: {e}"))?
            .commit_from_file(&path);

        let session = match session_res {
            Ok(s) => s,
            Err(e) => {
                // GPU/DirectML failed, fallback to CPU
                Session::builder()
                    .map_err(|e| anyhow!("Failed to create CPU fallback builder: {e}"))?
                    .with_execution_providers([
                        ort::execution_providers::CPUExecutionProvider::default().build(),
                    ])
                    .map_err(|e| anyhow!("Failed to set CPU EP: {e}"))?
                    .commit_from_file(&path)
                    .map_err(|e| anyhow!("AI Engine: Thất bại hoàn toàn khi nạp model: {e}"))?
            }
        };

        let arc_session = Arc::new(Mutex::new(session));
        let _ = self.phi3_session.set(arc_session.clone());
        Ok(arc_session)
    }

    pub fn get_ocr_det_session(&self) -> Result<Arc<Mutex<Session>>> {
        if let Some(s) = self.ocr_det_session.get() {
            return Ok(s.clone());
        }
        let path = self.resolve_model_path("ch_PP-OCRv3_det_infer.onnx");
        let session = Session::builder()
            .map_err(|e| anyhow!("Failed to create OCR builder: {e}"))?
            .with_execution_providers([self.get_best_ep()])
            .map_err(|e| anyhow!("Failed to set EP: {e}"))?
            .commit_from_file(&path)
            .map_err(|e: ort::Error| anyhow!("Failed to load model: {e}"))?;

        let arc_session = Arc::new(Mutex::new(session));
        let _ = self.ocr_det_session.set(arc_session.clone());
        Ok(arc_session)
    }

    pub fn get_ocr_rec_session(&self) -> Result<Arc<Mutex<Session>>> {
        if let Some(s) = self.ocr_rec_session.get() {
            return Ok(s.clone());
        }
        let path = self.resolve_model_path("ch_PP-OCRv3_rec_infer.onnx");
        let session = Session::builder()
            .map_err(|e| anyhow!("Failed to create OCR builder: {e}"))?
            .with_execution_providers([self.get_best_ep()])
            .map_err(|e| anyhow!("Failed to set EP: {e}"))?
            .commit_from_file(&path)
            .map_err(|e: ort::Error| anyhow!("Failed to load model: {e}"))?;

        let arc_session = Arc::new(Mutex::new(session));
        let _ = self.ocr_rec_session.set(arc_session.clone());
        Ok(arc_session)
    }

    pub fn get_embedding_session(&self) -> Result<Arc<Mutex<Session>>> {
        if let Some(s) = self.embedding_session.get() {
            return Ok(s.clone());
        }
        let path = self.resolve_model_path("all-MiniLM-L6-v2.onnx");
        let session = Session::builder()
            .map_err(|e| anyhow!("Failed to create Embedding builder: {e}"))?
            .with_execution_providers([self.get_best_ep()])
            .map_err(|e| anyhow!("Failed to set EP: {e}"))?
            .commit_from_file(&path)
            .map_err(|e| anyhow!("Failed to load model: {e}"))?;

        let arc_session = Arc::new(Mutex::new(session));
        let _ = self.embedding_session.set(arc_session.clone());
        Ok(arc_session)
    }

    pub fn get_qwen_session(&self) -> Result<Arc<Mutex<Session>>> {
        if let Some(s) = self.qwen_session.get() {
            return Ok(s.clone());
        }
        // Thử tìm model Qwen 2.5 INT4 (Cực nhẹ cho máy 2GB RAM)
        let path = self.resolve_model_path("qwen2.5_0.5b_int4.onnx");
        let path = if path.exists() {
            path
        } else {
            self.resolve_model_path("qwen.onnx")
        };

        let session_res = Session::builder()
            .map_err(|e| anyhow!("Failed to create Qwen builder: {e}"))?
            .with_execution_providers([self.get_best_ep()])
            .map_err(|e| anyhow!("Failed to set EP: {e}"))?
            .commit_from_file(&path);

        let session = match session_res {
            Ok(s) => s,
            Err(e) => {
                log::warn!("GPU Qwen load failed, falling back to CPU: {}", e);
                Session::builder()
                    .map_err(|e| anyhow!("Failed to create CPU Qwen builder: {e}"))?
                    .with_execution_providers([
                        ort::execution_providers::CPUExecutionProvider::default().build(),
                    ])
                    .map_err(|e| anyhow!("Failed to set CPU EP: {e}"))?
                    .commit_from_file(&path)
                    .map_err(|e| anyhow!("AI Engine: Thất bại hoàn toàn khi nạp Qwen: {e}"))?
            }
        };

        let arc_session = Arc::new(Mutex::new(session));
        let _ = self.qwen_session.set(arc_session.clone());
        Ok(arc_session)
    }
}

static AI_ENGINE: OnceLock<RwLock<Option<Arc<AIEngine>>>> = OnceLock::new();
static LAST_ACCESS: OnceLock<Mutex<std::time::Instant>> = OnceLock::new();

fn get_ai_engine_lock() -> &'static RwLock<Option<Arc<AIEngine>>> {
    AI_ENGINE.get_or_init(|| RwLock::new(None))
}

fn update_last_access() {
    let m = LAST_ACCESS.get_or_init(|| Mutex::new(std::time::Instant::now()));
    if let Ok(mut guard) = m.lock() {
        *guard = std::time::Instant::now();
    }
}

pub struct AIManager;

impl AIManager {
    pub fn new() -> Self {
        Self {}
    }

    pub fn init(&self, resource_dir: PathBuf, data_dir: PathBuf) {
        let lock = get_ai_engine_lock();
        let mut engine_opt = lock.write().unwrap();
        if engine_opt.is_none() {
            println!("[AI Manager] Initializing AI Engine...");
            *engine_opt = Some(Arc::new(AIEngine::new(resource_dir, data_dir)));
        } else {
            println!("[AI Manager] AI Engine already initialized.");
        }
    }

    pub fn shutdown(&self) {
        let lock = get_ai_engine_lock();
        let mut engine_opt = lock.write().unwrap();
        if engine_opt.is_some() {
            println!("[AI Manager] Shutting down AI Engine (releasing RAM)...");
            *engine_opt = None; // This drops the Arc<AIEngine> and its sessions
        }
    }

    pub fn get_ai_engine() -> Result<Arc<AIEngine>> {
        update_last_access();
        let lock = get_ai_engine_lock();
        let engine_opt = lock.read().unwrap();
        engine_opt
            .as_ref()
            .cloned()
            .ok_or_else(|| anyhow!("AI Engine not initialized or disabled"))
    }

    /// Kiểm tra và giải phóng RAM nếu AI không được sử dụng trong một khoảng thời gian (DEFAULT: 5 phút)
    pub fn auto_cleanup(&self, idle_timeout_secs: u64) -> bool {
        let last_access = LAST_ACCESS.get().map(|m| *m.lock().unwrap());
        if let Some(last) = last_access {
            if last.elapsed().as_secs() > idle_timeout_secs {
                println!(
                    "[AI Manager] Idle timeout reached ({}s). Unloading models...",
                    last.elapsed().as_secs()
                );
                self.shutdown();
                return true;
            }
        }
        false
    }

    pub fn get_embedding_engine(&self) -> Result<embedding::EmbeddingEngine> {
        let engine = Self::get_ai_engine()?;
        let session = engine.get_embedding_session()?;
        let tokenizer_path = engine.resolve_model_path("tokenizer.json");
        let tokenizer =
            embedding::get_tokenizer(&tokenizer_path).map_err(|e| anyhow!(e.to_string()))?;
        Ok(embedding::EmbeddingEngine::new(session, tokenizer))
    }

    pub fn get_phi3_engine(&self) -> Result<phi3::Phi3Engine> {
        let engine = Self::get_ai_engine()?;
        let session = engine.get_phi3_session()?;
        let tokenizer_path = engine.resolve_model_path("tokenizer.json");
        let tokenizer = tokenizers::Tokenizer::from_file(&tokenizer_path)
            .map_err(|e| anyhow!(e.to_string()))?;
        Ok(phi3::Phi3Engine::new(session, tokenizer))
    }

    pub fn get_qwen_engine(&self) -> Result<qwen::QwenEngine> {
        let engine = Self::get_ai_engine()?;
        let session = engine.get_qwen_session()?;
        let tokenizer_path = engine.resolve_model_path("tokenizer.json");
        let tokenizer = tokenizers::Tokenizer::from_file(&tokenizer_path)
            .map_err(|e| anyhow!(e.to_string()))?;
        Ok(qwen::QwenEngine::new(session, tokenizer))
    }

    pub fn get_self_heal_engine(&self) -> Result<self_heal::SelfHEAL> {
        let engine = self.get_phi3_engine()?;
        Ok(self_heal::SelfHEAL::new(engine))
    }

    pub fn get_ocr_engine(&self) -> Result<ocr::OcrEngine> {
        let engine = Self::get_ai_engine()?;
        let session_det = engine.get_ocr_det_session()?;
        let session_rec = engine.get_ocr_rec_session()?;
        Ok(ocr::OcrEngine::new(session_det, session_rec))
    }

    /*
    pub fn get_trainer(&self) -> trainer::TrainerService {
        trainer::TrainerService::new()
    }
    */

    pub fn is_phi3_loaded(&self) -> bool {
        Self::get_ai_engine()
            .ok()
            .and_then(|e| e.phi3_session.get().cloned())
            .is_some()
    }

    pub fn is_embedding_loaded(&self) -> bool {
        Self::get_ai_engine()
            .ok()
            .and_then(|e| e.embedding_session.get().cloned())
            .is_some()
    }

    pub fn get_downloader(&self, cache_dir: PathBuf) -> downloader::ModelManager {
        downloader::ModelManager::new(cache_dir)
    }
}

#[cfg(feature = "ai")]
pub mod downloader;
#[cfg(feature = "ai")]
pub mod embedding;
#[cfg(feature = "ai")]
pub mod ocr;
#[cfg(feature = "ai")]
pub mod phi3;
#[cfg(feature = "ai")]
pub mod qwen;
#[cfg(feature = "ai")]
pub mod self_heal;
// pub mod trainer;
#[cfg(feature = "ai")]
pub mod yolo;
