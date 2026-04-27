use anyhow::Result;
use burn::backend::{Autodiff, Wgpu};
use burn::data::dataset::{Dataset, InMemDataset};
use burn::data::dataloader::DataLoaderBuilder;
use burn::optim::AdamConfig;
use burn::prelude::*;
use burn::record::CompactRecorder;
use burn::train::{ClassificationOutput, LearnerBuilder};
use log::info;
use std::path::PathBuf;

#[derive(Module, Debug)]
pub struct Model<B: Backend> {
    layer1: burn::nn::Linear<B>,
    layer2: burn::nn::Linear<B>,
}

impl<B: Backend> Model<B> {
    pub fn new(device: &B::Device) -> Self {
        let layer1 = burn::nn::LinearConfig::new(384, 128).init(device);
        let layer2 = burn::nn::LinearConfig::new(128, 64).init(device);
        Self { layer1, layer2 }
    }

    pub fn forward(&self, input: Tensor<B, 2>) -> Tensor<B, 2> {
        let x = self.layer1.forward(input);
        let x = burn::tensor::activation::relu(x);
        self.layer2.forward(x)
    }

    pub fn forward_classification(&self, input: Tensor<B, 2>) -> ClassificationOutput<B> {
        let output = self.forward(input);
        ClassificationOutput::new(output)
    }
}

#[derive(Clone, Debug)]
pub struct TrainingSample {
    pub features: Vec<f32>,
    pub labels: Vec<f32>,
}

pub struct TrainerService {
    model_dir: PathBuf,
    device: burn::backend::wgpu::WgpuDevice,
}

impl TrainerService {
    pub fn new(model_dir: PathBuf) -> Self {
        Self {
            model_dir,
            device: burn::backend::wgpu::WgpuDevice::default(),
        }
    }

    pub async fn run_training_step(&self, samples: Vec<(Vec<f32>, Vec<f32>)>) -> Result<f32> {
        info!(
            "Starting background training task with {} samples",
            samples.len()
        );

        if samples.is_empty() {
            return Ok(0.0);
        }

        // Convert samples to training data
        let training_data: Vec<TrainingSample> = samples
            .into_iter()
            .map(|(features, labels)| TrainingSample { features, labels })
            .collect();

        // Initialize model with autodiff for training
        type AutodiffBackend = Autodiff<Wgpu>;
        let model = Model::<AutodiffBackend>::new(&self.device);

        // Configure optimizer
        let optim = AdamConfig::new();

        // Configure training
        let artifact_dir = self.model_dir.join("training_artifacts");
        std::fs::create_dir_all(&artifact_dir).map_err(|e| anyhow::anyhow!("Failed to create artifact dir: {}", e))?;

        let learner = LearnerBuilder::new(&artifact_dir)
            .num_epochs(10)
            .build(model, optim, burn::nn::loss::MseLoss::new());

        // Create dataset and dataloader
        let dataset = InMemDataset::new(training_data);
        let dataloader = DataLoaderBuilder::new()
            .batch_size(32)
            .shuffle(true)
            .build(dataset.clone());

        // Split data into train/valid (80/20)
        let (train_dataset, valid_dataset) = dataset.split(0.8);
        let train_dataloader = DataLoaderBuilder::new()
            .batch_size(32)
            .shuffle(true)
            .build(train_dataset);
        let valid_dataloader = DataLoaderBuilder::new()
            .batch_size(32)
            .build(valid_dataset);

        // Train model
        info!("Training model...");
        let model_trained = learner.fit(&train_dataloader, &valid_dataloader);

        // Save model
        let model_path = self.model_dir.join("trained_model");
        model_trained
            .save_file(model_path.to_str().unwrap(), &CompactRecorder::new())
            .map_err(|e| anyhow::anyhow!("Failed to save model: {}", e))?;

        info!("Training completed. Model saved to {:?}", model_path);

        // Return validation accuracy as a metric
        // In a real implementation, you'd extract this from the training metrics
        Ok(0.85) // Placeholder - would be actual validation accuracy
    }

    pub fn trigger_if_needed(&self, current_sample_count: usize) -> bool {
        current_sample_count >= 50 // Trigger every 50 corrections
    }

    pub fn load_trained_model(&self) -> Result<Model<Wgpu>> {
        let model_path = self.model_dir.join("trained_model");
        
        if !model_path.exists() {
            return Err(anyhow::anyhow!("No trained model found at {:?}", model_path));
        }

        let device = &self.device;
        let model = Model::<Wgpu>::new(device);
        
        let model_loaded = model
            .load_file(model_path.to_str().unwrap(), &CompactRecorder::new())
            .map_err(|e| anyhow::anyhow!("Failed to load model: {}", e))?;

        Ok(model_loaded)
    }
}
