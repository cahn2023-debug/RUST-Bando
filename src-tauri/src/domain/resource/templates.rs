use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ProjectTemplate {
    pub name: String,
    pub default_regions: Vec<String>,
    pub default_layers: Vec<String>,
}

pub fn get_default_templates() -> Vec<ProjectTemplate> {
    vec![ProjectTemplate {
        name: "Standard".to_string(),
        default_regions: vec!["Region 1".to_string()],
        default_layers: vec!["Layer 1".to_string()],
    }]
}
