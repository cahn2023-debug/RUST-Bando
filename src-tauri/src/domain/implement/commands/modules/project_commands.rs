pub use crate::domain::implement::commands::v2::{
    create_pmp_v2,
    load_pmp_file,
    open_project_bootstrap,
    get_project_bootstrap_v2,
    get_active_project,
    get_project_tree,
    save_recent_projects,
    save_last_opened_project,
    save_project,
    force_save_project,
    update_project_state_v2,
    save_project_bom_table,
    get_projects,
    close_active_project,
    remove_recent_project,
    delete_project,
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
        $crate::domain::implement::commands::modules::project_commands::save_project,
        $crate::domain::implement::commands::modules::project_commands::force_save_project,
        $crate::domain::implement::commands::modules::project_commands::update_project_state_v2,
        $crate::domain::implement::commands::modules::project_commands::save_project_bom_table,
        $crate::domain::implement::commands::modules::project_commands::get_projects,
        $crate::domain::implement::commands::modules::project_commands::close_active_project,
        $crate::domain::implement::commands::modules::project_commands::remove_recent_project,
        $crate::domain::implement::commands::modules::project_commands::delete_project
    };
}
