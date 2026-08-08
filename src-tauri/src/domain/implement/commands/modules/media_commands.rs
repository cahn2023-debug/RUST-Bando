pub use crate::domain::implement::commands::v2::{
    import_media_asset,
    import_pmp_into_project,
    delete_media_asset,
    replace_media_asset,
    resolve_media_asset,
    get_report_section_site_photos,
    optimize_project_storage,
    get_project_storage_health,
    analyze_project_media_recovery,
    apply_project_media_recovery,
};

pub use crate::domain::implement::commands::v2::{
    __cmd__import_media_asset,
    __cmd__import_pmp_into_project,
    __cmd__delete_media_asset,
    __cmd__replace_media_asset,
    __cmd__resolve_media_asset,
    __cmd__get_report_section_site_photos,
    __cmd__optimize_project_storage,
    __cmd__get_project_storage_health,
    __cmd__analyze_project_media_recovery,
    __cmd__apply_project_media_recovery,
};

#[macro_export]
macro_rules! register_media_commands {
    () => {
        $crate::domain::implement::commands::modules::media_commands::import_media_asset,
        $crate::domain::implement::commands::modules::media_commands::import_pmp_into_project,
        $crate::domain::implement::commands::modules::media_commands::delete_media_asset,
        $crate::domain::implement::commands::modules::media_commands::replace_media_asset,
        $crate::domain::implement::commands::modules::media_commands::resolve_media_asset,
        $crate::domain::implement::commands::modules::media_commands::get_report_section_site_photos,
        $crate::domain::implement::commands::modules::media_commands::optimize_project_storage,
        $crate::domain::implement::commands::modules::media_commands::get_project_storage_health,
        $crate::domain::implement::commands::modules::media_commands::analyze_project_media_recovery,
        $crate::domain::implement::commands::modules::media_commands::apply_project_media_recovery
    };
}
