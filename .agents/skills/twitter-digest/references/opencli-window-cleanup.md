# OpenCLI 窗口清理

OpenCLI 的 `--window background` 表示不抢焦点，不等于无窗口。macOS 上通过 Chrome Adapter 采集时，在运行 `prepare` 的同一个 shell 进程中使用下面的包装。把 `vault_root` 改成目标 vault 的绝对路径。

```bash
vault_root="/绝对路径/Mind-OS"

opencli_chrome_windows_before=""
if pgrep -x "Google Chrome" >/dev/null; then
  opencli_chrome_windows_before="$(osascript -e 'tell application "Google Chrome" to get id of every window' 2>/dev/null || true)"
fi

cleanup_opencli_window() {
  if ! pgrep -x "Google Chrome" >/dev/null; then
    return
  fi

  OPENCLI_CHROME_WINDOWS_BEFORE="$opencli_chrome_windows_before" osascript <<'APPLESCRIPT' >/dev/null 2>&1 || true
set beforeText to system attribute "OPENCLI_CHROME_WINDOWS_BEFORE"
set previousDelimiters to AppleScript's text item delimiters
set AppleScript's text item delimiters to ", "
set beforeIds to text items of beforeText
set AppleScript's text item delimiters to previousDelimiters

tell application "Google Chrome"
  set chromeWindows to every window
  repeat with chromeWindow in chromeWindows
    try
      set currentId to (id of chromeWindow) as text
      if beforeIds does not contain currentId then
        if (count of tabs of chromeWindow) is 1 then
          if (URL of active tab of chromeWindow) is "about:blank" then
            close chromeWindow
          end if
        end if
      end if
    end try
  end repeat
end tell
APPLESCRIPT
}

trap cleanup_opencli_window EXIT
mindos collect twitter prepare "$vault_root" --json
```

清理必须紧跟 `prepare`，不要等整个摘要流程结束。不得关闭运行前已经存在的窗口，不得关闭仍有多个标签页或仍在显示内容的窗口，也不得退出 Chrome。非 macOS、未使用 Chrome Adapter 或无法读取窗口列表时跳过清理，保留原始 `prepare` 结果和退出状态。
