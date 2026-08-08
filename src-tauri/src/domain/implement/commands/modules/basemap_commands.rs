pub use crate::domain::implement::modules::basemap::tile_cache::{
    clear_basemap_tile_cache, get_basemap_cache_stats, get_basemap_tile, prefetch_basemap_tiles,
};

pub use crate::domain::implement::modules::basemap::tile_cache::{
    __cmd__clear_basemap_tile_cache, __cmd__get_basemap_cache_stats, __cmd__get_basemap_tile,
    __cmd__prefetch_basemap_tiles,
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
