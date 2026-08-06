//! Basemap infrastructure.
//!
//! Deliberately a sibling of `v2` rather than a child of it: the basemap is not
//! project data. It has no `project_id`, it survives project switches, and it is
//! available before any project is opened. Nesting it under the project storage
//! module would have invited exactly the coupling this module exists to avoid.
pub mod tile_cache;
