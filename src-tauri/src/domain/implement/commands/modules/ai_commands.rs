pub use crate::domain::implement::commands::v2::{
    get_ai_config,
    update_ai_config,
    set_ai_api_key,
    delete_ai_api_key,
    get_ai_status,
    install_ai_models,
    cancel_ai_model_install,
    remove_ai_models,
    release_ai_memory,
    predict_task,
    analyze_contract_metadata,
    save_ai_correction,
    create_ai_conversation,
    list_ai_conversations,
    send_ai_message,
    cancel_ai_request,
    confirm_ai_action,
    reject_ai_action,
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
