#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
  echo "用法：collect-ego-browser.sh <输出 JSON 文件> <运行 ID>" >&2
  exit 2
fi

output_file=$1
run_id=$2
case "$run_id" in *[!0-9a-f]*|'') echo "运行 ID 必须是 32 位小写十六进制" >&2; exit 2 ;; esac
if [ "${#run_id}" -ne 32 ]; then
  echo "运行 ID 必须是 32 位小写十六进制" >&2
  exit 2
fi
if [ -e "$output_file" ]; then
  echo "输出文件已存在，拒绝覆盖：$output_file" >&2
  exit 2
fi

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
output_dir=$(dirname "$output_file")
if [ ! -d "$output_dir" ]; then
  echo "输出目录不存在：$output_dir" >&2
  exit 2
fi
[ "$(basename "$output_file")" = capture.json ] || { echo "输出文件必须是运行工作区中的 capture.json" >&2; exit 2; }
"$script_dir/manage-run-workspace.sh" validate-capture "$output_dir" "$run_id"

umask 077
capture_tmp=$(mktemp "$output_dir/.mindos-twitter-ego.XXXXXX")
task_started=0

report_ego_failure_file() {
  if grep -Fq 'ego-browser 未继承可用的 X 登录态' "$1"; then
    detail='ego-browser 未继承可用的 X 登录态'
  elif grep -Fq '找不到 X 时间线标签' "$1"; then
    detail='找不到 X 时间线标签，请检查 X 页面语言或布局'
  elif grep -Fq 'ego-browser 没有采集到可用的 Twitter 记录' "$1"; then
    detail='ego-browser 没有采集到可用的 Twitter 记录'
  elif grep -Fq 'ego-browser Twitter 时间线滚动停滞' "$1"; then
    detail='ego-browser Twitter 时间线滚动停滞'
  elif grep -Fq '用户正在控制 ego-browser 任务空间' "$1"; then
    detail='用户正在控制 ego-browser 任务空间'
  else
    detail='ego-browser 执行失败，原始诊断因可能包含登录信息而未显示'
  fi
  printf 'ego-browser Twitter 采集失败：%s\n' "$detail" >&2
}

report_ego_failure_text() {
  case "$1" in
    *'用户正在控制 ego-browser 任务空间'*) detail='用户正在控制 ego-browser 任务空间' ;;
    *) detail='ego-browser 任务空间收尾失败，原始诊断因可能包含登录信息而未显示' ;;
  esac
  printf 'ego-browser Twitter 采集失败：%s\n' "$detail" >&2
}

cleanup_failure() {
  status=$?
  trap - EXIT
  if [ "$status" -ne 0 ] && [ "$task_started" -eq 1 ]; then
    {
      printf "const name = 'mindos-twitter-%s'\n" "$run_id"
      cat <<'EOF'
const spaces = await listTaskSpaces()
const target = spaces.find(space => space.name === name || space.taskId === name)
if (target && target.ownership === 'agent') {
  await useOrCreateTaskSpace(target.id)
  for (const tab of await listTabs()) await closeTab(tab.targetId ?? tab.id ?? tab)
  await completeTaskSpace(target.id ?? name, { keep: false })
}
EOF
    } | ego-browser nodejs >/dev/null 2>&1 || true
  fi
  rm -f "$capture_tmp"
  exit "$status"
}
trap cleanup_failure EXIT
trap 'exit 130' INT
trap 'exit 143' HUP TERM

task_started=1
if ! {
  printf "const name = 'mindos-twitter-%s'\n" "$run_id"
  cat <<'EOF'
if (!/^mindos-twitter-[a-f0-9]{32}$/u.test(name)) throw new Error('ego-browser 运行任务空间 ID 非法')
const spaces = await listTaskSpaces()
const existing = spaces.find(space => space.name === name || space.taskId === name)
if (existing && existing.ownership !== 'agent') throw new Error('ego-browser 任务空间所有权不匹配')
const task = await useOrCreateTaskSpace(existing?.id ?? name)
if (task?.ownership && task.ownership !== 'agent') throw new Error('ego-browser 任务空间所有权不匹配')
await openOrReuseTab('https://x.com/home', { wait: true, timeout: 30 })
await wait(3)

const loginState = await js(String.raw`(() => ({
  url: location.href,
  hasLoginInput: Boolean(document.querySelector('input[autocomplete="username"]')),
  hasHomeNavigation: Boolean(document.querySelector('a[href="/home"]'))
}))()`)
if (loginState.hasLoginInput || /\/i\/flow\/login/u.test(loginState.url) || !loginState.hasHomeNavigation) {
  throw new Error('ego-browser 未继承可用的 X 登录态')
}

const extractVisible = async () => await js(String.raw`(() => [...document.querySelectorAll('article')].map(article => {
  const timeLink = article.querySelector('time')?.closest('a[href*="/status/"]')?.href || ''
  const fallbackLink = [...article.querySelectorAll('a[href*="/status/"]')]
    .map(link => link.href)
    .find(href => /^https:\/\/x\.com\/[^/]+\/status\/\d+(?:$|[?#])/u.test(href)) || ''
  const match = (timeLink || fallbackLink).match(/^https:\/\/x\.com\/([^/]+)\/status\/(\d+)/u)
  const text = article.querySelector('[data-testid="tweetText"]')?.innerText?.trim() || ''
  const mediaText = [...article.querySelectorAll('[data-testid="tweetPhoto"] img[alt]')]
    .map(image => image.alt.trim())
    .filter(Boolean)
    .join('\n')
  const metricCount = selector => {
    const element = article.querySelector(selector)
    const label = (element?.getAttribute('aria-label') || element?.innerText || '').replaceAll(',', '').trim()
    const match = label.match(/(\d+(?:\.\d+)?)\s*([KMB万亿]?)/iu)
    if (!match) return undefined
    const multiplier = ({ K: 1e3, M: 1e6, B: 1e9, '万': 1e4, '亿': 1e8 })[match[2].toUpperCase()] || 1
    return Math.round(Number(match[1]) * multiplier)
  }
  return {
    id: match?.[2] || '',
    title: text || mediaText,
    text: text || mediaText,
    url: match ? 'https://x.com/' + match[1] + '/status/' + match[2] : '',
    author: match?.[1] || '',
    replies: metricCount('[data-testid="reply"]'),
    views: metricCount('[data-testid="analytics"], a[href*="/analytics"]'),
    retweets: metricCount('[data-testid="retweet"], [data-testid="unretweet"]'),
    likes: metricCount('[data-testid="like"], [data-testid="unlike"]'),
    promoted: /(^|\n)(广告|推广|Ad|Promoted)(\n|$)/iu.test(article.innerText)
  }
}))()`)

const selectTimeline = async labels => {
  const available = await js(String.raw`(() => [...document.querySelectorAll('[role="tab"]')].map(tab => tab.innerText.trim()))()`)
  const label = labels.find(candidate => available.includes(candidate))
  if (!label) throw new Error('找不到 X 时间线标签：' + labels.join('/'))
  await click(`xpath=(//*[@role="tab"][normalize-space(.)="${label}"])[1]`, { label: '切换 Twitter 时间线' })
  await wait(3)
  await js(String.raw`window.scrollTo(0, 0)`)
  await wait(1)
}

const collectTimeline = async labels => {
  await selectTimeline(labels)
  const records = new Map()
  let stale = 0
  let naturalEnd = 0
  for (let step = 0; step < 90 && records.size < 50 && stale < 14; step++) {
    const before = records.size
    for (const record of await extractVisible()) {
      if (record.id && record.title && !record.promoted && !records.has(record.id)) records.set(record.id, record)
    }
    stale = records.size === before ? stale + 1 : 0
    const scrollState = await js(String.raw`(() => ({
      atBottom: window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 8,
      loading: Boolean(document.querySelector('[role="progressbar"]'))
    }))()`)
    naturalEnd = records.size > 0 && records.size === before && scrollState.atBottom && !scrollState.loading ? naturalEnd + 1 : 0
    if (naturalEnd >= 3) break
    if (records.size < 50) {
      if (stale > 0 && stale % 5 === 0) {
        await scrollBy(-240)
        await wait(1)
        await scrollBy(1140)
        await wait(3)
      } else {
        await scrollBy(900)
        await wait(1.5)
      }
    }
  }
  if (stale >= 14 && naturalEnd < 3 && records.size < 50) throw new Error('ego-browser Twitter 时间线滚动停滞')
  return [...records.values()].slice(0, 50)
}

const records = new Map()
for (const record of await collectTimeline(['为你推荐', 'For you'])) records.set(record.id, record)
for (const record of await collectTimeline(['正在关注', 'Following'])) records.set(record.id, records.get(record.id) ?? record)
if (records.size === 0) throw new Error('ego-browser 没有采集到可用的 Twitter 记录')

const output = [...records.values()].map(({ id, title, text, url, author, replies, views, retweets, likes }) => ({ id, title, text, url, author, replies, views, retweets, likes }))
cliLog(JSON.stringify({ records: output }))
EOF
} | ego-browser nodejs >/dev/null 2>"$capture_tmp"
then
  report_ego_failure_file "$capture_tmp"
  exit 1
fi

if ! completion=$({
  printf "const name = 'mindos-twitter-%s'\n" "$run_id"
  cat <<'EOF'
if (!/^mindos-twitter-[a-f0-9]{32}$/u.test(name)) throw new Error('ego-browser 运行任务空间 ID 非法')
const spaces = await listTaskSpaces()
const target = spaces.find(space => space.name === name || space.taskId === name)
if (target?.ownership === 'user' || target?.ownership === 'agentDelegatedToUser') {
  throw new Error('用户正在控制 ego-browser 任务空间')
}
if (!target || target.ownership !== 'agent') throw new Error('ego-browser 任务空间所有权不匹配')
const result = await completeTaskSpace(target.id ?? name, { keep: false })
if (result?.done !== true) throw new Error('ego-browser 任务空间收尾失败')
EOF
} | ego-browser nodejs 2>&1 >/dev/null
); then
  report_ego_failure_text "$completion"
  exit 1
fi

chmod 600 "$capture_tmp"
mv "$capture_tmp" "$output_file"
trap - EXIT
