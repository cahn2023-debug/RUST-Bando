pub use crate::domain::implement::commands::v2::{
    analyze_contract_metadata, cancel_ai_model_install, cancel_ai_request, confirm_ai_action,
    create_ai_conversation, delete_ai_api_key, get_ai_config, get_ai_status, install_ai_models,
    list_ai_conversations, predict_task, reject_ai_action, release_ai_memory, remove_ai_models,
    save_ai_correction, send_ai_message, set_ai_api_key, update_ai_config,
};

pub use crate::domain::implement::commands::v2::{
    __cmd__analyze_contract_metadata, __cmd__cancel_ai_model_install, __cmd__cancel_ai_request,
    __cmd__confirm_ai_action, __cmd__create_ai_conversation, __cmd__delete_ai_api_key,
    __cmd__get_ai_config, __cmd__get_ai_status, __cmd__install_ai_models,
    __cmd__list_ai_conversations, __cmd__predict_task, __cmd__reject_ai_action,
    __cmd__release_ai_memory, __cmd__remove_ai_models, __cmd__save_ai_correction,
    __cmd__send_ai_message, __cmd__set_ai_api_key, __cmd__update_ai_config,
};

#[macro_export]
macro_rules! register_ai_commands {
    () => {
        $crate::domain::implement::commands::modules::ai_commands::get_ai_config,
        $crate::domain::implement::commands::modules::ai_commands::update_ai_config,
        $crate::domain::implement::commands::modules::ai_commands::set_ai_api_key,
        $crate::domain::implement::commands::modules::ai_commands::delete_ai_api_key,
        $crate::domain::implement::commands::modules::ai_commands::get_ai_status,
        $crate::domain::implement::commands::modules::ai_commands::install_ai_models,
        $crate::domain::implement::commands::modules::ai_commands::cancel_ai_model_install,
        $crate::domain::implement::commands::modules::ai_commands::remove_ai_models,
        $crate::domain::implement::commands::modules::ai_commands::release_ai_memory,
        $crate::domain::implement::commands::modules::ai_commands::predict_task,
        $crate::domain::implement::commands::modules::ai_commands::analyze_contract_metadata,
        $crate::domain::implement::commands::modules::ai_commands::save_ai_correction,
        $crate::domain::implement::commands::modules::ai_commands::create_ai_conversation,
        $crate::domain::implement::commands::modules::ai_commands::list_ai_conversations,
        $crate::domain::implement::commands::modules::ai_commands::send_ai_message,
        $crate::domain::implement::commands::modules::ai_commands::cancel_ai_request,
        $crate::domain::implement::commands::modules::ai_commands::confirm_ai_action,
        $crate::domain::implement::commands::modules::ai_commands::reject_ai_action
    };
}
