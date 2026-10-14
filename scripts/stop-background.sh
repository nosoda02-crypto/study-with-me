#!/bin/zsh
set -eu
project_dir="${0:A:h:h}"
pid_file="$project_dir/.study-with-me-dev.pid"
if [[ ! -f "$pid_file" ]]; then
  echo "没有找到后台运行记录。"
  exit 0
fi
app_pid="$(<"$pid_file")"
if ! kill -0 "$app_pid" 2>/dev/null; then
  electron_bin="$project_dir/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
  app_pid="$(pgrep -f "$electron_bin $project_dir" | head -n 1 || true)"
fi
if [[ -n "$app_pid" ]] && kill -0 "$app_pid" 2>/dev/null; then
  kill "$app_pid" 2>/dev/null || true
  echo "已停止 Study With Me（PID $app_pid）。"
else
  echo "记录中的进程已经结束。"
fi
rm -f "$pid_file"
