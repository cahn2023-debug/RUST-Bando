pub mod engine;
pub mod ingestion;
/// V2 Projections Module (CQRS-lite)
///
/// Transforms events into read model tables.
pub mod utils;

pub use engine::{
    ContentItemProjector, ContractProjector, FeatureGroupProjector, FeatureProjector,
    FileProjector, LayerProjector, MaterialProjector, NoteProjector, PersonnelProjector,
    ProjectProjector, ProjectionEngine, Projector, RegionProjector, SettingsProjector,
    TaskProjector, WorkItemProjector,
};
