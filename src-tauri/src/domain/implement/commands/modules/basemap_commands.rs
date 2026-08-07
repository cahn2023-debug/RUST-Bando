pub use crate::domain::implement::modules::basemap::tile_cache::{
    get_basemap_tile,
    prefetch_basemap_tiles,
    get_basemap_cache_stats,
    clear_basemap_tile_cache,
};

#[macro_export]
macro_rules! register_basemap_commands {
    () => {
        $crate::domain::implement::commands::modules::basemap_commands::get_basemap_tile,
        $crate::domain::implement::commands::modules::basemap_commands::prefetch_basemap_tiles,
        $crate::domain::implement::commands::modules::basemap_commands::get_basemap_cache_stats,
        $crate::domain::implement::commands::modules::basemap_commands::clear_basemap_tile_cache
    };
}
