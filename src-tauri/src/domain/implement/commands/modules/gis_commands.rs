pub use crate::domain::implement::commands::gis_commands::{
    st_as_ewkt, st_geom_from_ewkt, st_is_valid, st_make_valid, st_measure_feature,
    st_spatial_relate, st_transform,
};

pub use crate::domain::implement::commands::gis_commands::{
    __cmd__st_as_ewkt, __cmd__st_geom_from_ewkt, __cmd__st_is_valid, __cmd__st_make_valid,
    __cmd__st_measure_feature, __cmd__st_spatial_relate, __cmd__st_transform,
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
