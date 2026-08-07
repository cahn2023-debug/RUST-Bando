pub use crate::domain::implement::commands::gis_commands::{
    st_geom_from_ewkt,
    st_as_ewkt,
    st_is_valid,
    st_make_valid,
    st_transform,
    st_measure_feature,
    st_spatial_relate,
};

#[macro_export]
macro_rules! register_gis_commands {
    () => {
        $crate::domain::implement::commands::modules::gis_commands::st_geom_from_ewkt,
        $crate::domain::implement::commands::modules::gis_commands::st_as_ewkt,
        $crate::domain::implement::commands::modules::gis_commands::st_is_valid,
        $crate::domain::implement::commands::modules::gis_commands::st_make_valid,
        $crate::domain::implement::commands::modules::gis_commands::st_transform,
        $crate::domain::implement::commands::modules::gis_commands::st_measure_feature,
        $crate::domain::implement::commands::modules::gis_commands::st_spatial_relate
    };
}
