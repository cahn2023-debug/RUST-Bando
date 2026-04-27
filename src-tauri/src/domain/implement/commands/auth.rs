use dotenvy;
use serde_json;
use std::io::{Read, Write};
use std::net::TcpListener;
use crate::implement::modules::core::config::ConfigState;
#[tauri::command]
pub async fn google_login_flow() -> Result<String, String> {
    println!("[OAuth] Bắt đầu luồng đăng nhập Google...");
    
    let client_id = dotenvy::var("VITE_GOOGLE_CLIENT_ID").map_err(|_| {
        let err = "Lỗi: Không tìm thấy VITE_GOOGLE_CLIENT_ID trong file .env".to_string();
        println!("[OAuth] {}", err);
        err
    })?;

    let client_secret = dotenvy::var("VITE_GOOGLE_CLIENT_SECRET").map_err(|_| {
        let err = "Lỗi: Không tìm thấy VITE_GOOGLE_CLIENT_SECRET trong file .env".to_string();
        println!("[OAuth] {}", err);
        err
    })?;

    // 1. Setup Loopback Listener on port 51376
    println!("[OAuth] Khởi tạo Listener tại 127.0.0.1:51376...");
    let listener = TcpListener::bind("127.0.0.1:51376").map_err(|e| {
        let err = format!("Cổng 51376 đang bị chiếm dụng hoặc không thể truy cập: {}. Vui lòng kiểm tra xem có phiên app khác đang chạy không.", e);
        println!("[OAuth] {}", err);
        err
    })?;
    
    // Set non-blocking to allow timeout in accept
    listener.set_nonblocking(true).ok();
    
    // 2. Build the Google OAuth URL (Authorization Code Flow)
    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri=http://127.0.0.1:51376&response_type=code&scope=openid%20email%20profile&access_type=offline&prompt=consent",
        client_id
    );

    // 3. Open the browser
    println!("[OAuth] Đang mở trình duyệt để đăng nhập...");
    let _ = webbrowser::open(&auth_url);

    // 4. Capture authorization code with timeout
    let authorization_code = tauri::async_runtime::spawn_blocking(move || {
        let start = std::time::Instant::now();
        let timeout = std::time::Duration::from_secs(120); // 2 minutes to login

        loop {
            if start.elapsed() > timeout {
                return Err("Hết thời gian chờ đăng nhập (2 phút). Vui lòng thử lại.".to_string());
            }

            match listener.accept() {
                Ok((mut stream, _)) => {
                    stream.set_read_timeout(Some(std::time::Duration::from_secs(10))).ok();
                    let mut buffer = [0; 2048];
                    match stream.read(&mut buffer) {
                        Ok(size) => {
                            let request = String::from_utf8_lossy(&buffer[..size]);
                            
                            // Parse code=... from the URL
                            if let Some(after_code) = request.split("code=").nth(1) {
                                let raw_code = after_code.split(&['&', ' '][..]).next().unwrap_or("");
                                let decoded_code = urlencoding::decode(raw_code).unwrap_or(std::borrow::Cow::Borrowed(raw_code)).into_owned();
                                
                                println!("[OAuth] Đã nhận mã code thành công.");
                                
                                let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\r\n
                                    <html>
                                    <body style=\"background: #0F0F0F; color: white; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0;\">
                                        <div style=\"background: #1A1A1A; padding: 3rem; border-radius: 1.5rem; border: 1px solid rgba(255,255,255,0.1); text-align: center; max-width: 400px; box-shadow: 0 20px 50px rgba(0,0,0,0.5);\">
                                            <div style=\"width: 64px; height: 64px; background: #00f2fe; border-radius: 1rem; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem;\">
                                                <svg width=\"32\" height=\"32\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"black\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"20 6 9 17 4 12\"></polyline></svg>
                                            </div>
                                            <h2 style=\"color: white; margin: 0 0 0.5rem; font-size: 1.5rem; font-weight: 800; letter-spacing: -0.025em;\">XÁC THỰC THÀNH CÔNG</h2>
                                            <p style=\"color: #A0A0A0; font-size: 0.875rem; line-height: 1.5;\">Bạn đã đăng nhập thành công. Hãy quay lại ứng dụng để tiếp tục làm việc.</p>
                                            <p style=\"color: #666; font-size: 0.75rem; margin-top: 2rem;\">Cửa sổ này sẽ tự động đóng.</p>
                                        </div>
                                        <script>setTimeout(() => window.close(), 2000);</script>
                                    </body>
                                    </html>";
                                let _ = stream.write_all(response.as_bytes());
                                return Ok(decoded_code);
                            } else {
                                let response = "HTTP/1.1 400 Bad Request\r\n\r\nLỗi: Không tìm thấy mã code xác thực.";
                                let _ = stream.write_all(response.as_bytes());
                                return Err("Không tìm thấy code trong callback URL".to_string());
                            }
                        }
                        Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                            std::thread::sleep(std::time::Duration::from_millis(100));
                            continue;
                        }
                        Err(e) => return Err(format!("Lỗi đọc stream: {}", e)),
                    }
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(std::time::Duration::from_millis(200));
                    continue;
                }
                Err(e) => return Err(format!("Lỗi accept connection: {}", e)),
            }
        }
    }).await.map_err(|e| format!("Thread panic: {}", e))??;


    // 5. Exchange code for id_token
    println!("[OAuth] Đang trao đổi mã code lấy ID Token từ Google...");
    let token_url = "https://oauth2.googleapis.com/token";
    
    let client = reqwest::Client::new();
    let token_res = client
        .post(token_url)
        .form(&[
            ("code", authorization_code.as_str()),
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("redirect_uri", "http://127.0.0.1:51376"),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await
        .map_err(|e| format!("Token exchange request failed: {}", e))?;

    let token_data: serde_json::Value = token_res.json()
        .await
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    let id_token = token_data["id_token"]
        .as_str()
        .ok_or_else(|| format!("No id_token in response: {:?}", token_data))?
        .to_string();

    println!("[OAuth] Đăng nhập thành công! Đã có ID Token.");
    Ok(id_token)
}

#[tauri::command]
pub fn set_current_user(
    app: tauri::AppHandle,
    state: tauri::State<'_, ConfigState>,
    email: String,
) -> Result<(), String> {
    use tauri::Manager;
    let mut config = (**state.0.load()).clone();
    config.current_user_email = Some(email.clone());
    
    // Force Admin for specific user
    if email == "thanh.bd@tfsc.com.vn" {
        println!("[Auth] Super User detected. Forcing Admin role.");
        config.user_roles.insert(email.clone(), "Admin".to_string());
    }
    
    // Auto-assign Admin for the first user
    if config.user_roles.is_empty() {
        println!("[Auth] First user detected. Assigning Admin role to {}", email);
        config.user_roles.insert(email, "Admin".to_string());
    }

    let app_data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("local_data"));
    let res = config.save(&app_data_dir);
    state.0.store(std::sync::Arc::new(config));
    res
}

#[tauri::command]
pub fn logout_user(
    app: tauri::AppHandle,
    state: tauri::State<'_, ConfigState>,
) -> Result<(), String> {
    use tauri::Manager;
    let mut config = (**state.0.load()).clone();
    config.current_user_email = None;

    let app_data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("local_data"));
    let res = config.save(&app_data_dir);
    state.0.store(std::sync::Arc::new(config));
    res
}

