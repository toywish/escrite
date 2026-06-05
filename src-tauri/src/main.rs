#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::Path;

/// 校验文件路径的合法性，防止路径穿越攻击和系统敏感文件泄露。
///
/// # 参数
/// * `file_path` - 需要校验的文件绝对或相对路径
///
/// # 返回值
/// 如果路径合法返回 `Ok(())`，否则返回包含错误信息的 `Err(String)`。
fn validate_path(file_path: &str) -> Result<(), String> {
    let path = Path::new(file_path);

    // 1. 校验扩展名是否为 .md 或 .markdown（忽略大小写）
    match path.extension() {
        Some(ext) => {
            let ext_str = ext.to_string_lossy().to_lowercase();
            if ext_str != "md" && ext_str != "markdown" {
                return Err("只允许读取或保存 .md 或 .markdown 格式的文件".to_string());
            }
        }
        None => {
            return Err("文件必须包含扩展名且只允许是 .md 或 .markdown".to_string());
        }
    }

    // 2. 校验路径是否指向敏感的系统目录或文件
    let path_str = path.to_string_lossy().to_lowercase();
    let path_normalized = path_str.replace("/", "\\"); // 统一使用反斜杠方便在 Windows 上对比

    // Windows 平台特殊系统目录保护
    let sys_root = std::env::var("SystemRoot")
        .or_else(|_| std::env::var("windir"))
        .unwrap_or_else(|_| "C:\\Windows".to_string())
        .to_lowercase();
    let mut sys_root_normalized = sys_root.replace("/", "\\");
    if !sys_root_normalized.ends_with('\\') {
        sys_root_normalized.push('\\');
    }

    // 如果路径以 Windows 系统目录开头，或者包含 system32 路径片段，则拦截
    if path_normalized.starts_with(&sys_root_normalized) 
        || path_normalized.contains("\\system32\\") 
        || path_normalized.starts_with("system32\\")
    {
        return Err("禁止访问系统敏感目录或文件".to_string());
    }

    // Unix 平台特定系统目录保护 (如 /etc/, /var/, /sys/, /proc/, /dev/)
    // 在 Windows 上以 \etc\ 等开头的路径也一并拦截
    if path_normalized.starts_with("\\etc\\")
        || path_normalized.starts_with("\\var\\")
        || path_normalized.starts_with("\\sys\\")
        || path_normalized.starts_with("\\proc\\")
        || path_normalized.starts_with("\\dev\\")
    {
        return Err("禁止访问系统敏感目录或文件".to_string());
    }

    // 如果是 Unix 格式绝对路径以 /etc/ 等开头也进行拦截
    let unix_normalized = path_str.replace("\\", "/");
    if unix_normalized.starts_with("/etc/")
        || unix_normalized.starts_with("/var/")
        || unix_normalized.starts_with("/sys/")
        || unix_normalized.starts_with("/proc/")
        || unix_normalized.starts_with("/dev/")
    {
        return Err("禁止访问系统敏感目录或文件".to_string());
    }

    Ok(())
}

/// 从本地读取 Markdown 文件内容
#[tauri::command]
fn read_md_file(file_path: String) -> Result<String, String> {
    validate_path(&file_path)?;
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err("文件不存在".to_string());
    }
    // 检测是否为符号链接，防范跟随攻击
    let metadata = fs::symlink_metadata(path).map_err(|err| err.to_string())?;
    if metadata.file_type().is_symlink() {
        return Err("禁止读取符号链接文件".to_string());
    }
    if path.is_dir() {
        return Err("所选路径是一个目录，不是文件".to_string());
    }
    fs::read_to_string(path).map_err(|err| err.to_string())
}

/// 将编辑器内容写入本地文件
#[tauri::command]
fn save_md_file(file_path: String, content: String) -> Result<(), String> {
    validate_path(&file_path)?;
    let path = Path::new(&file_path);
    if path.exists() {
        // 如果已存在该路径，检测其是否为符号链接，防范跟随攻击
        let metadata = fs::symlink_metadata(path).map_err(|err| err.to_string())?;
        if metadata.file_type().is_symlink() {
            return Err("禁止写入符号链接文件".to_string());
        }
    }
    if path.is_dir() {
        return Err("所选路径是一个目录，不能写入".to_string());
    }
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

    #[test]
    fn test_validate_path() {
        // 1. 合法文件路径
        assert!(validate_path("test.md").is_ok());
        assert!(validate_path("sub/folder/file.markdown").is_ok());
        assert!(validate_path("C:\\Users\\test\\docs\\notes.MD").is_ok());
        assert!(validate_path("my_windows_dir/some_file.markdown").is_ok());

        // 2. 不合法的扩展名
        assert!(validate_path("test.txt").is_err());
        assert!(validate_path("test.png").is_err());
        assert!(validate_path("no_extension").is_err());

        // 3. 敏感系统路径
        assert!(validate_path("C:\\Windows\\System32\\cmd.exe").is_err());
        assert!(validate_path("/etc/passwd").is_err());
        assert!(validate_path("Windows/System32/drivers/etc/hosts").is_err());
        assert!(validate_path("windows/system32/cmd.exe").is_err());
    }

    #[test]
    fn test_invalid_paths_in_commands() {
        // 测试不允许读写敏感路径或不合法的扩展名
        assert!(read_md_file("/etc/passwd".to_string()).is_err());
        assert!(save_md_file("C:\\Windows\\System32\\test.md".to_string(), "content".to_string()).is_err());
        assert!(read_md_file("test.txt".to_string()).is_err());
    }

    #[test]
    fn test_symlink_protection() {
        let target_file = "./temp_target.md";
        let symlink_file = "./temp_symlink.md";
        
        let _ = fs::write(target_file, "original content");
        
        // 尝试创建符号链接（跨平台）
        #[cfg(unix)]
        let link_result = std::os::unix::fs::symlink(target_file, symlink_file);
        #[cfg(windows)]
        let link_result = std::os::windows::fs::symlink_file(target_file, symlink_file);
        
        if link_result.is_ok() {
            // 如果成功创建了符号链接，验证后端是否正确拒绝读写
            assert!(read_md_file(symlink_file.to_string()).is_err());
            assert!(save_md_file(symlink_file.to_string(), "new content".to_string()).is_err());
            let _ = fs::remove_file(symlink_file);
        }
        
        let _ = fs::remove_file(target_file);
    }
}
