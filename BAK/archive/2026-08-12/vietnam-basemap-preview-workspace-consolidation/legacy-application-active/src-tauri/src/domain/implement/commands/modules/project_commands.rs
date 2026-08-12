pub use crate::domain::implement::commands::v2::{
    close_active_project, create_pmp_v2, delete_project, find_nearest_snap_point,
    force_save_project, get_active_project, get_project_bootstrap_v2, get_project_tree,
    get_projects, invoke_design_event_batch, load_pmp_file, normalize_metadata,
    open_project_bootstrap, redo_design_event, remove_recent_project, save_last_opened_project,
    save_project, save_project_bom_table, save_recent_projects, undo_design_event,
    update_project_state_v2,
};

pub use crate::domain::implement::commands::v2::{
    __cmd__close_active_project, __cmd__create_pmp_v2, __cmd__delete_project,
    __cmd__find_nearest_snap_point, __cmd__force_save_project, __cmd__get_active_project,
    __cmd__get_project_bootstrap_v2, __cmd__get_project_tree, __cmd__get_projects,
    __cmd__invoke_design_event_batch, __cmd__load_pmp_file, __cmd__normalize_metadata,
    __cmd__open_project_bootstrap, __cmd__redo_design_event, __cmd__remove_recent_project,
    __cmd__save_last_opened_project, __cmd__save_project, __cmd__save_project_bom_table,
    __cmd__save_recent_projects, __cmd__undo_design_event, __cmd__update_project_state_v2,
};

#[macro_export]
macro_rules! register_project_commands {
    () => {
        $crate::domain::implement::commands::modules::project_commands::create_pmp_v2,
        $crate::domain::implement::commands::modules::project_commands::load_pmp_file,
        $crate::domain::implement::commands::modules::project_commands::open_project_bootstrap,
        $crate::domain::implement::commands::modules::project_commands::get_project_bootstrap_v2,
        $crate::domain::implement::commands::modules::project_commands::get_active_project,
        $crate::domain::implement::commands::modules::project_commands::get_project_tree,
        $crate::domain::implement::commands::modules::project_commands::save_recent_projects,
        $crate::domain::implement::commands::modules::project_commands::save_last_opened_project,
        $crate::domain::implement::commands::modules::project_commands::invoke_design_event_batch,
        $crate::domain::implement::commands::modules::project_commands::normalize_metadata,
        $crate::domain::implement::commands::modules::project_commands::find_nearest_snap_point,
        $crate::domain::implement::commands::modules::project_commands::save_project,
        $crate::domain::implement::commands::modules::project_commands::force_save_project,
        $crate::domain::implement::commands::modules::project_commands::update_project_state_v2,
        $crate::domain::implement::commands::modules::project_commands::save_project_bom_table,
        $crate::domain::implement::commands::modules::project_commands::get_projects,
        $crate::domain::implement::commands::modules::project_commands::close_active_project,
        $crate::domain::implement::commands::modules::project_commands::remove_recent_project,
        $crate::domain::implement::commands::modules::project_commands::delete_project,
        $crate::domain::implement::commands::modules::project_commands::undo_design_event,
        $crate::domain::implement::commands::modules::project_commands::redo_design_event
    };
}
