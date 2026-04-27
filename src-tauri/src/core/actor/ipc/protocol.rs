use bincode::Options;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct IpcRequest<T> {
    pub id: String,
    pub payload: T,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IpcResponse<T> {
    pub id: String,
    pub data: T,
    pub status: String, // "ok" or "error"
}

pub fn encode<T: Serialize>(data: &T) -> Result<Vec<u8>, String> {
    let options = bincode::options().with_fixint_encoding();
    options.serialize(data).map_err(|e| e.to_string())
}

pub fn decode<'a, T: Deserialize<'a>>(bytes: &'a [u8]) -> Result<T, String> {
    let options = bincode::options().with_fixint_encoding();
    options.deserialize(bytes).map_err(|e| e.to_string())
}
