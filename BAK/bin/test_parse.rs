use serde::{Deserialize, Serialize};
use serde_json;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum AppEvent {
    FeatureCreated { name: String },
    FeatureUpdated { changes: serde_json::Value },
}

fn main() {
    let payload = r#"{"type":"FeatureUpdated","name":null,"geom_type":null,"coordinates":null,"properties":null,"layer_id":null,"group_id":null,"metadata":"{\"id\":\"test\"}"}"#;
    let res: Result<AppEvent, _> = serde_json::from_str(payload);
    match res {
        Ok(event) => println!("Success: {:?}", event),
        Err(e) => println!("Error: {}", e),
    }

    // Test without payload wrapper
    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(tag = "type")]
    pub enum AppEventNoPayload {
        FeatureUpdated {
            changes: Option<serde_json::Value>,
            metadata: Option<String>,
        },
    }
    let res2: Result<AppEventNoPayload, _> = serde_json::from_str(payload);
    match res2 {
        Ok(event) => println!("Success (NoPayload): {:?}", event),
        Err(e) => println!("Error (NoPayload): {}", e),
    }
}
