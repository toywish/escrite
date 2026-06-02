#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::Path;

/// 从本地读取 Markdown 文件内容
#[tauri::command]
fn read_md_file(file_path: String) -> Result<String, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err("文件不存在".to_string());
    }
    fs::read_to_string(path).map_err(|err| err.to_string())
}

/// 将编辑器内容写入本地文件
#[tauri::command]
fn save_md_file(file_path: String, content: String) -> Result<(), String> {
    let path = Path::new(&file_path);
    fs::write(path, content).map_err(|err| err.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init()) // 注册原生的本地文件选择框插件
        .invoke_handler(tauri::generate_handler![read_md_file, save_md_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_read_and_write_flow() {
        let temp_file = "./temp_test_file.md";
        let test_content = "# Hello Rust Unit Test";

        // 1. 测试写入
        let write_result = save_md_file(temp_file.to_string(), test_content.to_string());
        assert!(write_result.is_ok());

        // 2. 测试读取
        let read_result = read_md_file(temp_file.to_string());
        assert!(read_result.is_ok());
        assert_eq!(read_result.unwrap(), test_content);

        // 3. 清理测试文件
        let _ = fs::remove_file(temp_file);
    }

    #[test]
    fn test_read_non_existent_file() {
        let result = read_md_file("./non_existent_file_xyz.md".to_string());
        assert!(result.is_err());
        assert_eq!(result.err().unwrap(), "文件不存在");
    }
}
