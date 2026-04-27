use crate::implement::modules::core::config::ConfigState;
use std::str::FromStr;

pub enum Role {
    Admin,
    ProjectManager,
    User,
}

impl FromStr for Role {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "Admin" => Ok(Role::Admin),
            "ProjectManager" => Ok(Role::ProjectManager),
            "User" => Ok(Role::User),
            _ => Err(()),
        }
    }
}

impl Role {
    pub fn priority(&self) -> i32 {
        match self {
            Role::Admin => 100,
            Role::ProjectManager => 50,
            Role::User => 10,
        }
    }
}

pub fn check_permission(
    state: &tauri::State<'_, ConfigState>,
    required_role: Role,
) -> Result<String, String> {
    let config = state.0.load();

    let user_email = config
        .current_user_email
        .as_ref()
        .ok_or("Bạn chưa đăng nhập. Vui lòng đăng nhập để thực hiện thao tác này.")?;

    let user_role_str = config.user_roles.get(user_email).ok_or(format!(
        "Tài khoản {} chưa được cấp quyền truy cập. Vui lòng liên hệ Admin.",
        user_email
    ))?;

    let user_role =
        Role::from_str(user_role_str).map_err(|_| "Vai trò người dùng không hợp lệ.")?;

    if user_role.priority() >= required_role.priority() {
        Ok(user_email.clone())
    } else {
        Err("Bạn không có đủ quyền hạn để thực hiện thao tác này.".to_string())
    }
}

pub fn get_current_user_email(state: &tauri::State<'_, ConfigState>) -> Option<String> {
    state.0.load().current_user_email.clone()
}
