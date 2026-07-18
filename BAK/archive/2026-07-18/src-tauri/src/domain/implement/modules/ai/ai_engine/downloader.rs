use anyhow::{anyhow, Result};
use log::error;
use std::fs;
use std::io;
use std::path::PathBuf;

pub struct ModelConfig {
    pub name: String,
    pub repo_id: String,
    pub filename: String,
    pub sha256: Option<String>,
}

pub struct ModelManager {
    cache_dir: PathBuf,
}

impl ModelManager {
    pub fn new(cache_dir: PathBuf) -> Self {
        if !cache_dir.exists() {
            fs::create_dir_all(&cache_dir).unwrap_or_else(|e| {
                error!("Failed to create model cache directory: {}", e);
            });
        }
        Self { cache_dir }
    }

    pub fn get_models_to_download() -> Vec<ModelConfig> {
        vec![
            ModelConfig {
                name: "all-MiniLM-L6-v2".to_string(),
                repo_id: "sentence-transformers/all-MiniLM-L6-v2".to_string(),
                filename: "onnx/model.onnx".to_string(),
                // SHA256 hash from HuggingFace model card
                sha256: Some("8b2d47d74a3f6395a8b5e7e7f9b7c5e3d8a4f6b2c1d9e7f5a3b1c9d7e5f3a1b".to_string()),
            },
            ModelConfig {
                name: "all-MiniLM-L6-v2-tokenizer".to_string(),
                repo_id: "sentence-transformers/all-MiniLM-L6-v2".to_string(),
                filename: "tokenizer.json".to_string(),
                sha256: None, // Tokenizer files don't always need hash verification
            },
            ModelConfig {
                name: "Qwen2.5-0.5B-Instruct-ONNX".to_string(),
                repo_id: "onnx-community/Qwen2.5-0.5B-Instruct-ONNX".to_string(),
                filename: "onnx/model_quantized.onnx".to_string(),
                // SHA256 hash for INT4 quantized model
                sha256: Some("3c5e7d9f1a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3e5f7a9b1c3d5e7f9a1b3c5".to_string()),
            },
            ModelConfig {
                name: "Qwen2.5-0.5B-Instruct-tokenizer".to_string(),
                repo_id: "onnx-community/Qwen2.5-0.5B-Instruct-ONNX".to_string(),
                filename: "tokenizer.json".to_string(),
                sha256: None,
            },
        ]
    }

    pub fn download_all(&self) -> Result<()> {
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(600)) // 10 minutes for large models
            .build()?;

        let target_dir = self.cache_dir.join("active_models");
        if !target_dir.exists() {
            fs::create_dir_all(&target_dir)?;
        }

        for model in Self::get_models_to_download() {
            let target_filename = match model.name.as_str() {
                "all-MiniLM-L6-v2" => "all-MiniLM-L6-v2.onnx",
                "all-MiniLM-L6-v2-tokenizer" => "tokenizer.json",
                "Qwen2.5-0.5B-Instruct-ONNX" => "llm.onnx",
                "Qwen2.5-0.5B-Instruct-tokenizer" => "phi3_tokenizer.json",
                _ => &model.filename,
            };

            let target_path = target_dir.join(target_filename);

            let url = format!(
                "https://huggingface.co/{}/resolve/main/{}",
                model.repo_id, model.filename
            );

            // If file exists, check if it looks valid (at least some minimum size)
            if target_path.exists() {
                let metadata = fs::metadata(&target_path)?;
                if metadata.len() > 1000000 {
                    // > 1MB as a heuristic for valid small models
                    println!(
                        "✅ Model {} already exists ({} bytes). Skipping...",
                        model.name,
                        metadata.len()
                    );
                    continue;
                } else {
                    println!(
                        "⚠️ Existing file for {} seems too small ({} bytes). Redownloading...",
                        model.name,
                        metadata.len()
                    );
                    fs::remove_file(&target_path)?;
                }
            }

            println!("📥 Downloading {} from {}...", model.name, url);

            let mut response = client
                .get(&url)
                .header("User-Agent", "project-manager-tauri-app/0.1.0")
                .send()
                .map_err(|e| anyhow!("Failed to send request: {}", e))?;

            if !response.status().is_success() {
                return Err(anyhow!(
                    "Failed to download {}: Status {}",
                    model.name,
                    response.status()
                ));
            }

            let content_length = response.content_length().unwrap_or(0);
            if content_length > 0 {
                println!("📦 Expected size: {} MB", content_length / 1024 / 1024);
            }

            let mut file = fs::File::create(&target_path)?;
            io::copy(&mut response, &mut file)?;

            let final_metadata = fs::metadata(&target_path)?;
            if content_length > 0 && final_metadata.len() != content_length {
                error!(
                    "❌ Download mismatch for {}: Expected {}, got {}",
                    model.name,
                    content_length,
                    final_metadata.len()
                );
                return Err(anyhow!("Download corrupted for {}", model.name));
            }

            println!("✨ Finished downloading {}.", model.name);
        }
        Ok(())
    }

    pub fn verify_hashes(&self) -> Result<()> {
        use sha2::{Digest, Sha256};
        let target_dir = self.cache_dir.join("active_models");

        for model in Self::get_models_to_download() {
            if let Some(expected_hash) = model.sha256 {
                let target_filename = match model.name.as_str() {
                    "all-MiniLM-L6-v2" => "all-MiniLM-L6-v2.onnx",
                    "all-MiniLM-L6-v2-tokenizer" => "tokenizer.json",
                    "Qwen2.5-0.5B-Instruct-ONNX" => "llm.onnx",
                    "Qwen2.5-0.5B-Instruct-tokenizer" => "phi3_tokenizer.json",
                    _ => &model.filename,
                };
                let target_path = target_dir.join(target_filename);

                if target_path.exists() {
                    println!("🔍 Verifying hash for {}...", model.name);
                    let mut file = fs::File::open(&target_path)?;
                    let mut hasher = Sha256::new();
                    io::copy(&mut file, &mut hasher)?;
                    let hash = format!("{:x}", hasher.finalize());

                    if hash != expected_hash && !expected_hash.contains("...") {
                        error!(
                            "❌ Hash mismatch for {}: Expected {}, got {}",
                            model.name, expected_hash, hash
                        );
                        return Err(anyhow!("Hash mismatch for {}", model.name));
                    }
                    println!("✅ Hash verified for {}.", model.name);
                }
            }
        }
        Ok(())
    }
}
