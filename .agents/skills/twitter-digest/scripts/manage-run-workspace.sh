#!/bin/sh
set -eu

umask 077
retention_seconds=$((30 * 86400))

fail() {
  printf '%s\n' "$1" >&2
  exit 2
}

canonical_directory() {
  [ -d "$1" ] && [ ! -L "$1" ] || fail "目录不存在或是符号链接：$1"
  (cd "$1" && pwd -P)
}

directory_mode() {
  if stat -f '%Lp' "$1" >/dev/null 2>&1; then stat -f '%Lp' "$1"; else stat -c '%a' "$1"; fi
}

trusted_root() {
  candidate=${MINDOS_TWITTER_RUN_ROOT:-${TMPDIR:-/tmp}/mindos-twitter-runs-$(id -u)}
  case "$candidate" in /*) ;; *) fail "运行根目录必须是绝对路径" ;; esac
  if [ ! -e "$candidate" ]; then mkdir -m 700 "$candidate"; fi
  root=$(canonical_directory "$candidate")
  [ -O "$root" ] || fail "运行根目录不属于当前用户"
  [ "$(directory_mode "$root")" = 700 ] || fail "运行根目录权限必须是 0700"
  printf '%s\n' "$root"
}

canonical_vault() {
  case "$1" in *'
'*) fail "vault 路径不能包含换行" ;; esac
  canonical_directory "$1"
}

validate_run() {
  requested=$1
  vault=$(canonical_vault "$2")
  root=$(trusted_root)
  [ -d "$requested" ] && [ ! -L "$requested" ] || fail "运行工作区不存在或是符号链接"
  run_dir=$(canonical_directory "$requested")
  parent=$(canonical_directory "$(dirname "$run_dir")")
  [ "$parent" = "$root" ] || fail "运行工作区不是可信根目录的直接子目录"
  name=$(basename "$run_dir")
  case "$name" in run-*) run_id=${name#run-} ;; *) fail "运行 ID 非法" ;; esac
  case "$run_id" in *[!0-9a-f]*|'') fail "运行 ID 非法" ;; esac
  [ "${#run_id}" -eq 32 ] || fail "运行 ID 非法"
  [ "$(cat "$run_dir/.mindos-twitter-run" 2>/dev/null || true)" = "$run_id" ] || fail "运行 marker 不匹配"
  [ "$(cat "$run_dir/owner-uid" 2>/dev/null || true)" = "$(id -u)" ] || fail "运行工作区所有者不匹配"
  [ "$(cat "$run_dir/vault-path" 2>/dev/null || true)" = "$vault" ] || fail "运行工作区属于另一个 vault"
  [ "$(directory_mode "$run_dir")" = 700 ] || fail "运行工作区权限必须是 0700"
}

validate_capture_run() {
  [ "$#" -eq 2 ] || fail "用法：manage-run-workspace.sh validate-capture <run-dir> <run-id>"
  requested=$1
  expected_id=$2
  case "$expected_id" in *[!0-9a-f]*|'') fail "运行 ID 非法" ;; esac
  [ "${#expected_id}" -eq 32 ] || fail "运行 ID 非法"
  root=$(trusted_root)
  [ -d "$requested" ] && [ ! -L "$requested" ] || fail "运行工作区不存在或是符号链接"
  run_dir=$(canonical_directory "$requested")
  [ "$(canonical_directory "$(dirname "$run_dir")")" = "$root" ] || fail "运行工作区不是可信根目录的直接子目录"
  [ "$(basename "$run_dir")" = "run-$expected_id" ] || fail "运行目录与运行 ID 不匹配"
  [ "$(cat "$run_dir/.mindos-twitter-run" 2>/dev/null || true)" = "$expected_id" ] || fail "运行 marker 不匹配"
  [ "$(cat "$run_dir/owner-uid" 2>/dev/null || true)" = "$(id -u)" ] || fail "运行工作区所有者不匹配"
  [ "$(directory_mode "$run_dir")" = 700 ] || fail "运行工作区权限必须是 0700"
  [ "$(cat "$run_dir/phase" 2>/dev/null || true)" = created ] || fail "capture 只能写入 created 工作区"
}

write_value() {
  printf '%s\n' "$2" > "$1"
  chmod 600 "$1"
}

create_run() {
  [ "$#" -eq 1 ] || fail "用法：manage-run-workspace.sh create <vault>"
  vault=$(canonical_vault "$1")
  root=$(trusted_root)
  create_lock="$root/.create-lock"
  if ! mkdir -m 700 "$create_lock" 2>/dev/null; then
    if [ ! -d "$create_lock" ] || [ -L "$create_lock" ] || [ ! -O "$create_lock" ] || [ "$(directory_mode "$create_lock")" != 700 ]; then
      fail "Twitter 运行创建锁不可信"
    fi
    lock_pid=$(cat "$create_lock/pid" 2>/dev/null || true)
    case "$lock_pid" in *[!0-9]*|'') ;; *) kill -0 "$lock_pid" 2>/dev/null && fail "Twitter 运行工作区正在创建，请稍后重试" ;; esac
    rm -f -- "$create_lock/pid"
    rmdir "$create_lock" 2>/dev/null || fail "Twitter 运行工作区正在创建，请稍后重试"
    mkdir -m 700 "$create_lock" 2>/dev/null || fail "Twitter 运行工作区正在创建，请稍后重试"
  fi
  trap 'rm -f -- "$create_lock/pid"; rmdir "$create_lock" >/dev/null 2>&1 || true' EXIT
  write_value "$create_lock/pid" "$$"
  for candidate in "$root"/run-*; do
    [ -e "$candidate" ] || continue
    if (validate_run "$candidate" "$vault") >/dev/null 2>&1; then
      validate_run "$candidate" "$vault"
      phase=$(cat "$run_dir/phase")
      case "$phase" in applied|reverted) ;; *) fail "同一 vault 已有未完成的 Twitter 运行：$run_dir" ;; esac
    fi
  done
  run_id=$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')
  case "$run_id" in *[!0-9a-f]*|'') fail "无法生成运行 ID" ;; esac
  [ "${#run_id}" -eq 32 ] || fail "运行 ID 长度非法"
  run_dir="$root/run-$run_id"
  mkdir -m 700 "$run_dir"
  write_value "$run_dir/.mindos-twitter-run" "$run_id"
  write_value "$run_dir/owner-uid" "$(id -u)"
  write_value "$run_dir/vault-path" "$vault"
  write_value "$run_dir/phase" "created"
  write_value "$run_dir/created-at" "$(date +%s)"
  rm -f -- "$create_lock/pid"
  rmdir "$create_lock"
  trap - EXIT
  printf '%s\n' "$run_dir"
}

transition_run() {
  [ "$#" -ge 3 ] && [ "$#" -le 4 ] || fail "用法：manage-run-workspace.sh transition <run-dir> <vault> <phase> [reserved-at]"
  validate_run "$1" "$2"
  next=$3
  current=$(cat "$run_dir/phase")
  case "${4:-}" in ''|*[!0-9]*) [ "$#" -eq 3 ] || fail "reserved-at 必须是 Unix 秒" ;; esac
  case "$current:$next" in
    created:captured) [ -f "$run_dir/capture.json" ] && [ ! -L "$run_dir/capture.json" ] || fail "capture 文件不存在"; chmod 600 "$run_dir/capture.json" ;;
    prepared:reviewed|reviewed:previewed) ;;
    previewed:applying)
      batch=$(cat "$run_dir/batch-id" 2>/dev/null || true)
      [ -f "$run_dir/decisions-twitter-$batch.json" ] && [ ! -L "$run_dir/decisions-twitter-$batch.json" ] || fail "原决策文件不存在"
      write_value "$run_dir/reserved-at" "${4:-$(date +%s)}"
      ;;
    applying:applied)
      if [ "$#" -eq 4 ]; then write_value "$run_dir/reserved-at" "$4"; fi
      ;;
    applied:reverted) ;;
    *) fail "非法工作区阶段转换：$current -> $next" ;;
  esac
  write_value "$run_dir/phase" "$next"
}

bind_batch() {
  [ "$#" -eq 3 ] || fail "用法：manage-run-workspace.sh bind <run-dir> <vault> <batch-id>"
  validate_run "$1" "$2"
  phase=$(cat "$run_dir/phase")
  case "$phase" in created|captured) ;; *) fail "只有 created 或 captured 工作区可以绑定批次" ;; esac
  case "$3" in *[!0-9a-f]*|'') fail "batch ID 非法" ;; esac
  [ "${#3}" -eq 32 ] || fail "batch ID 非法"
  write_value "$run_dir/batch-id" "$3"
  if [ "$phase" = captured ]; then rm -f -- "$run_dir/capture.json"; fi
  write_value "$run_dir/phase" "prepared"
}

cleanup_run() {
  [ "$#" -eq 2 ] || fail "用法：manage-run-workspace.sh cleanup <run-dir> <vault>"
  validate_run "$1" "$2"
  phase=$(cat "$run_dir/phase")
  case "$phase" in created|captured|prepared|reviewed|previewed) ;; *) fail "工作区已进入提交或保留阶段，拒绝清理：$phase" ;; esac
  rm -rf -- "$run_dir"
}

recover_runs() {
  [ "$#" -eq 1 ] || fail "用法：manage-run-workspace.sh recover <vault>"
  vault=$1
  root=$(trusted_root)
  for candidate in "$root"/run-*; do
    [ -e "$candidate" ] || continue
    if (validate_run "$candidate" "$vault") >/dev/null 2>&1; then
      validate_run "$candidate" "$vault"
      phase=$(cat "$run_dir/phase")
      case "$phase" in applied|reverted) ;; *) printf '%s\n' "$run_dir" ;; esac
    fi
  done
}

prune_runs() {
  [ "$#" -ge 1 ] && [ "$#" -le 2 ] || fail "用法：manage-run-workspace.sh prune <vault> [now]"
  vault=$1
  now=${2:-$(date +%s)}
  case "$now" in *[!0-9]*|'') fail "now 必须是 Unix 秒" ;; esac
  root=$(trusted_root)
  for candidate in "$root"/run-*; do
    [ -e "$candidate" ] || continue
    if ! (validate_run "$candidate" "$vault") >/dev/null 2>&1; then continue; fi
    validate_run "$candidate" "$vault"
    phase=$(cat "$run_dir/phase")
    case "$phase" in applied|reverted) ;; *) continue ;; esac
    reserved=$(cat "$run_dir/reserved-at" 2>/dev/null || true)
    case "$reserved" in *[!0-9]*|'') continue ;; esac
    age=$((now - reserved))
    if [ "$age" -gt "$retention_seconds" ]; then rm -rf -- "$run_dir"; fi
  done
}

[ "$#" -ge 1 ] || fail "缺少工作区命令"
command=$1
shift
case "$command" in
  create) create_run "$@" ;;
  transition) transition_run "$@" ;;
  bind) bind_batch "$@" ;;
  cleanup) cleanup_run "$@" ;;
  recover) recover_runs "$@" ;;
  prune) prune_runs "$@" ;;
  validate-capture) validate_capture_run "$@" ;;
  *) fail "未知工作区命令：$command" ;;
esac
