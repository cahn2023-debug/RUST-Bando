/// V2 Pipeline Module
///
/// Actor-based message pipeline for data processing.

pub mod actor_system;

pub use actor_system::{
    Actor, ActorHandle, spawn_actor, Pipeline,
    IngestionMessage, IngestionResponse,
    ParsingMessage, ParsingResponse,
    NormalizationMessage, NormalizationResponse,
    StorageMessage, StorageResponse,
    IngestionActor, ParsingActor, NormalizationActor, StorageActor,
};
