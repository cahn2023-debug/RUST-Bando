pub use crate::domain::implement::commands::v2::{
    get_pending_sync_outbox, mark_outbox_synced, sync_v2_get_status, sync_v2_go_offline,
    sync_v2_go_online, sync_v2_is_online, sync_v2_start,
};

pub use crate::domain::implement::commands::v2::{
    __cmd__get_pending_sync_outbox, __cmd__mark_outbox_synced, __cmd__sync_v2_get_status,
    __cmd__sync_v2_go_offline, __cmd__sync_v2_go_online, __cmd__sync_v2_is_online,
    __cmd__sync_v2_start,
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
