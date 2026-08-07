pub use crate::domain::implement::commands::v2::{
    sync_v2_get_status,
    sync_v2_is_online,
    sync_v2_go_online,
    sync_v2_go_offline,
    sync_v2_start,
    get_pending_sync_outbox,
    mark_outbox_synced,
};

#[macro_export]
macro_rules! register_sync_commands {
    () => {
        $crate::domain::implement::commands::modules::sync_commands::sync_v2_get_status,
        $crate::domain::implement::commands::modules::sync_commands::sync_v2_is_online,
        $crate::domain::implement::commands::modules::sync_commands::sync_v2_go_online,
        $crate::domain::implement::commands::modules::sync_commands::sync_v2_go_offline,
        $crate::domain::implement::commands::modules::sync_commands::sync_v2_start,
        $crate::domain::implement::commands::modules::sync_commands::get_pending_sync_outbox,
        $crate::domain::implement::commands::modules::sync_commands::mark_outbox_synced
    };
}
