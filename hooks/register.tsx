// Claude 메모리 패널: 앱 화면·가상 머신·세션별 메모리를 보여 주고 앱을 다시 켠다. 모양은 rc-panel·checkbot-session 을 따랐다.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Lang, Note, Snap } from '../types'
import { demoSnap } from './demo'
import { STRINGS } from './strings'

const PANE = 'ram-watch'
const REFRESH_MS = 30_000
const GEAR = '⚙'
const HIDE_ICON_KEY = 'hideIcon'
const LANG_KEY = 'lang'
const TITLE_TOOL = 'mcp__ccd_session_mgmt__get_session'

const ON_COLOR = '#7BE0A8'
const IDLE_COLOR = '#9C9A92'
const CURRENT_COLOR = '#EF9F27'
const BORDER = '#6F6E69'

const snap = atom({ plugin: 'ram-watch', key: 'snap' } as const, null as Snap | null, { shape: 'snap-3' })
const note = atom({ plugin: 'ram-watch', key: 'note' } as const, null as Note | null, { shape: 'note-2' })
const isConfirming = atom({ plugin: 'ram-watch', key: 'isConfirming' } as const, false as boolean)
const isPaneOpen = atom({ plugin: 'ram-watch', key: 'isPaneOpen' } as const, false as boolean)
const isSettingsOpen = atom({ plugin: 'ram-watch', key: 'isSettingsOpen' } as const, false as boolean)
const isIconHidden = atom({ plugin: 'ram-watch', key: 'isIconHidden' } as const, false as boolean)
const selfTitle = atom({ plugin: 'ram-watch', key: 'selfTitle' } as const, '')
const lang = atom({ plugin: 'ram-watch', key: 'lang' } as const, 'ko' as Lang)

// 프로세스별 개인 메모리(바이트). 세션은 그 아래 자식(MCP 서버 등)까지 더하되, 재는 PowerShell 자신은 뺀다.
// self: 이 PowerShell 에서 위로 올라가 처음 만나는 세션 claude.exe = 지금 이 세션.
export const MEASURE = String.raw`
$all = Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,Name,ExecutablePath,PrivatePageCount
$kids = @{}; $byPid = @{}
foreach ($x in $all) { $byPid[[int]$x.ProcessId] = $x; $k = [int]$x.ParentProcessId; if ($k -ne [int]$x.ProcessId) { $kids[$k] += ,$x } }
function Sum($x, $d) { if ([int]$x.ProcessId -eq $PID) { return 0 }; $s = [double]$x.PrivatePageCount; if ($d -lt 8) { foreach ($c in $kids[[int]$x.ProcessId]) { $s += Sum $c ($d + 1) } }; $s }
function IsSession($x) { $x.Name -eq 'claude.exe' -and $x.ExecutablePath -like '*\claude-code\*' }
$self = 0; $me = $byPid[$PID]
for ($i = 0; $me -and $i -lt 12; $i++) { if (IsSession $me) { $self = [int]$me.ProcessId; break }; $me = $byPid[[int]$me.ParentProcessId] }
# shortcut: 'vmmem' is taken as Claude's VM (WSL shows as vmmemWSL); revisit if Docker/Sandbox also run
$vm = @($all | Where-Object Name -eq 'vmmem')
$app = @($all | Where-Object { $_.ExecutablePath -like '*\WindowsApps\Claude_*' })
$ses = @($all | Where-Object { IsSession $_ })
@{
  vmOn = $vm.Count -gt 0
  vm = [double](($vm | Measure-Object PrivatePageCount -Sum).Sum)
  app = [double](($app | Measure-Object PrivatePageCount -Sum).Sum)
  sessions = @($ses | ForEach-Object { @{ pid = [int]$_.ProcessId; b = (Sum $_ 0) } })
  self = $self
  ram = [double](Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory
} | ConvertTo-Json -Compress
`

// 앱을 끄면 이 세션도 같이 죽으니, WMI로 앱 바깥에 따로 띄운 PowerShell이 끄고·VM 서비스를 껐다 켜고·앱을 다시 연다.
export const RESTART_INNER = String.raw`
Start-Sleep 2
Get-Process -Name claude -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*\WindowsApps\Claude_*" -or $_.Path -like "*\claude-code\*" } | Stop-Process -Force
Start-Sleep 3
sc.exe stop CoworkVMService | Out-Null
for ($i = 0; $i -lt 30 -and (Get-Process vmmem -ErrorAction SilentlyContinue); $i++) { Start-Sleep 1 }
sc.exe start CoworkVMService | Out-Null
Start-Sleep 2
Start-Process "shell:AppsFolder\Claude_pzs8sxrjxfjjc!Claude"
`

// PowerShell -EncodedCommand 형식(UTF-16LE를 base64로). 명령줄로 넘길 때 따옴표가 사라지는 일을 막는다.
export function encode(script: string) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const b: number[] = []
  for (let i = 0; i < script.length; i++) {
    const c = script.charCodeAt(i)
    b.push(c & 255, c >> 8)
  }
  let out = ''
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i]! << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0)
    out += A[(n >> 18) & 63]! + A[(n >> 12) & 63]!
    out += i + 1 < b.length ? A[(n >> 6) & 63]! : '='
    out += i + 2 < b.length ? A[n & 63]! : '='
  }
  return out
}

export function launcher(inner: string) {
  return `$r = ([wmiclass]'Win32_Process').Create('powershell -NoProfile -WindowStyle Hidden -EncodedCommand ${encode(inner)}')
if ($r.ReturnValue -ne 0) { exit 1 }`
}

const ps = (script: string) => ['powershell', '-NoProfile', '-NonInteractive', '-EncodedCommand', encode(script)]

export function gb(bytes: number, digits = 2) {
  return `${(bytes / 1024 ** 3).toFixed(digits)} GB`
}

export const total = (s: Snap) => s.vm + s.app + s.sessions.reduce((a, x) => a + x.b, 0)

// 입력창 아래 버튼: PC 메모리 중 Claude 가 쓰는 몫을 채워지는 원으로, 옆에 GB 숫자 하나
export function iconLabel(s: Snap | null) {
  if (!s) return '◌'
  const share = s.ram > 0 ? total(s) / s.ram : 0
  const glyph = share < 0.125 ? '○' : share < 0.375 ? '◔' : share < 0.625 ? '◑' : share < 0.875 ? '◕' : '●'
  // 좁은 빈칸(U+202F): 보통 빈칸은 아이콘과 숫자가 멀어 보였다(2026-11-06 사용자 그림)
  return `${glyph} ${(total(s) / 1024 ** 3).toFixed(1)}`
}

// 지금 세션의 claude.exe pid: 이 PowerShell 에서 위로 올라가 처음 만나는 세션 프로세스. 세션마다 처음 한 번만 찾는다
export const FIND_SELF = String.raw`
$byPid = @{}; foreach ($x in Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,Name,ExecutablePath) { $byPid[[int]$x.ProcessId] = $x }
$me = $byPid[$PID]
for ($i = 0; $me -and $i -lt 12; $i++) { if ($me.Name -eq 'claude.exe' -and $me.ExecutablePath -like '*\claude-code\*') { [int]$me.ProcessId; exit }; $me = $byPid[[int]$me.ParentProcessId] }
0
`

// 여러 세션이 측정 하나를 같이 쓴다: 결과를 TEMP 아래 파일에 두고, 오래됐을 때만 한 세션이 다시 잰다.
// claim 파일은 "지금 내가 재는 중"이라는 표시라, 그동안 다른 세션은 조금 묵은 값을 그대로 쓴다
const FRESH_MS = REFRESH_MS - 3_000
const CLAIM_MS = 15_000
type Shared = Omit<Snap, 'self'>

let selfPid = 0
let hasLookedForSelf = false
let shareDir: string | null = null

async function getShareDir($: EngineInterface) {
  if (shareDir === null) {
    const temp = await $.env.get('TEMP').catch(() => undefined)
    // TEMP 가 없으면 나눠 쓰지 않고 세션마다 잰다 (작업 폴더에 파일을 만들지 않게)
    shareDir = temp ? `${temp}/claude-ram-watch` : ''
  }
  return shareDir
}

async function readJson($: EngineInterface, path: string): Promise<unknown> {
  try {
    return JSON.parse(await $.fs.read(path))
  } catch {
    return null
  }
}

async function measure($: EngineInterface): Promise<Shared> {
  const raw = JSON.parse((await $.process.run(ps(MEASURE))).stdout)
  if (raw.self) selfPid = raw.self
  return { vmOn: !!raw.vmOn, vm: raw.vm ?? 0, app: raw.app ?? 0, sessions: raw.sessions ?? [], ram: raw.ram ?? 0, at: Date.now() }
}

async function findSelf($: EngineInterface) {
  hasLookedForSelf = true
  try {
    selfPid = Number.parseInt((await $.process.run(ps(FIND_SELF))).stdout, 10) || 0
  } catch {
    // 못 찾으면 '지금 이 세션' 표시 없이 보여 준다
  }
}

// 한 세션 안에서 갱신이 겹치면(세션 시작·패널 열기·타이머) 먼저 돈 것을 같이 기다린다
let running: Promise<void> | null = null

function refresh($: EngineInterface, isForced = false) {
  running ??= refreshOnce($, isForced).finally(() => {
    running = null
  })
  return running
}

// `/ram-watch demo`로 연 동안은 예시 숫자만 보여 주고, 재지도 앱을 끄지도 않는다 (스크린샷용, rc-panel 과 같은 방식)
let isDemo = false

async function refreshOnce($: EngineInterface, isForced: boolean) {
  if (isDemo) {
    const t = STRINGS[await read($, lang)]
    await update($, snap, () => demoSnap(Date.now()))
    await update($, selfTitle, () => t.demoTitle)
    await update($, note, () => null)
    return
  }
  try {
    const dir = await getShareDir($)
    const now = Date.now()
    let value = dir ? ((await readJson($, `${dir}/snap.json`)) as Shared | null) : null
    const claim = dir ? ((await readJson($, `${dir}/claim.json`)) as { at?: number } | null) : null
    const isFresh = !!value && now - value.at < FRESH_MS
    const isClaimed = !!claim?.at && now - claim.at < CLAIM_MS
    if (isForced || !value || (!isFresh && !isClaimed)) {
      if (dir) await $.fs.write(`${dir}/claim.json`, JSON.stringify({ at: now }))
      value = await measure($)
      if (dir) await $.fs.write(`${dir}/snap.json`, JSON.stringify(value))
    }
    if (!selfPid && !hasLookedForSelf) await findSelf($)
    const next: Snap = { ...value, self: selfPid }
    await update($, snap, () => next)
    await update($, note, n => (n?.code === 'measureFailed' ? null : n))
  } catch {
    await update($, note, () => ({ code: 'measureFailed' as const }))
  }
}

// 데스크톱 앱이면 지금 세션 제목을 이름으로 쓴다. 이미 허용된 도구일 때만(권한 창을 띄우지 않게)
async function loadTitle($: EngineInterface) {
  try {
    const input = { session_id: 'self' }
    const { decision } = await $.tool.check({ tool: TITLE_TOOL, input } as never)
    if (decision !== 'allow') return
    const { text } = await $.tool.call({ tool: TITLE_TOOL, ...input } as never)
    const title = (JSON.parse(String(text ?? '')) as { title?: unknown }).title
    if (typeof title === 'string' && !isDemo) await update($, selfTitle, () => title)
  } catch {
    // 제목 없이 pid 로 보여 준다
  }
}

async function restart($: EngineInterface) {
  if (!(await read($, isConfirming))) {
    await update($, isConfirming, () => true)
    // 5초 안에 다시 눌러야 실행한다
    $.clock.after(5000, () => void update($, isConfirming, () => false))
    return
  }
  await update($, isConfirming, () => false)
  if (isDemo) return
  const r = await $.process.run(ps(launcher(RESTART_INNER)))
  const next: Note = r.exitCode === 0 ? { code: 'restarting' } : { code: 'restartFailed', exitCode: r.exitCode }
  await update($, note, () => next)
}

async function openPane($: EngineInterface) {
  await $.ui.open({ id: PANE, title: STRINGS[await read($, lang)].paneTitle })
  await update($, isPaneOpen, () => true)
  await refresh($)
}

// 패널이 열려 있으면 닫고 true를 돌려준다
async function closeIfOpen($: EngineInterface) {
  const panes = await $.ui.panes()
  if (!panes.some(pane => pane.id === PANE)) return false
  await $.ui.close({ id: PANE })
  await update($, isPaneOpen, () => false)
  return true
}

async function togglePane($: EngineInterface) {
  if (!(await closeIfOpen($))) await openPane($)
}

// 사용자가 고른 언어가 기본값이다. 고른 적이 없으면 Claude Code 언어 설정과 시스템 언어를 따른다 (rc-panel 과 같은 순서)
async function resolveLang($: EngineInterface): Promise<Lang> {
  const stored = await $.store.get(LANG_KEY)
  if (stored === 'ko' || stored === 'en') return stored
  try {
    const setting = (await $.config.list()).find(row => row.key === 'language')?.value
    if (typeof setting === 'string' && setting) return /^(ko|korean|한국어)/i.test(setting) ? 'ko' : 'en'
  } catch {
    // 설정을 읽지 못하면 시스템 언어를 본다
  }
  const system = await $.env.get('LANG').catch(() => undefined)
  return system?.startsWith('ko') ? 'ko' : 'en'
}

async function toggleLang($: EngineInterface) {
  const next: Lang = (await read($, lang)) === 'ko' ? 'en' : 'ko'
  await update($, lang, () => next)
  await $.store.set(LANG_KEY, next)
  // 열린 패널은 같은 id로 다시 열면 제목만 바뀐다. 예시 세션 제목도 새 언어로
  if ((await $.ui.panes()).some(pane => pane.id === PANE)) await $.ui.open({ id: PANE, title: STRINGS[next].paneTitle })
  if (isDemo) await update($, selfTitle, () => STRINGS[next].demoTitle)
}

async function toggleIcon($: EngineInterface) {
  const next = !(await read($, isIconHidden))
  await update($, isIconHidden, () => next)
  await $.store.set(HIDE_ICON_KEY, next)
}

async function toggleSettings($: EngineInterface) {
  const next = !(await read($, isSettingsOpen))
  await update($, isSettingsOpen, () => next)
}

// 버튼 처리는 10초 안에 끝나야 한다. 측정은 뒤에서 이어 간다
function background(work: Promise<unknown>) {
  void work.catch(() => {})
}

// 그리는 도중에는 상태를 쓸 수 없어 세션 시작에서 갱신을 건다
let isStarted = false

async function start($: EngineInterface) {
  if (isStarted) return
  isStarted = true
  const resolved = await resolveLang($)
  await update($, lang, () => resolved)
  if ((await $.store.get(HIDE_ICON_KEY)) === true) await update($, isIconHidden, () => true)
  try {
    const panes = await $.ui.panes()
    await update($, isPaneOpen, () => panes.some(pane => pane.id === PANE))
  } catch {
    // 패널 목록을 못 읽으면 닫힌 것으로 본다
  }
  background(loadTitle($))
  background(refresh($))
  $.clock.every(REFRESH_MS, () => void refresh($))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await start($)
    await $.command.register({ name: 'ram-watch', description: STRINGS[await read($, lang)].commandDescription })
    return next(e)
  })

  on('command.run', { command: 'ram-watch' }, async ($, e) => {
    await start($)
    const t = STRINGS[await read($, lang)]
    const wasDemo = isDemo
    isDemo = e.args.trim() === 'demo'
    // 예시에서 실제로(또는 그 반대로) 바꿀 때는 닫지 않고 그 자리에서 다시 그린다
    if (isDemo === wasDemo && (await closeIfOpen($))) return { text: t.closed }
    if (wasDemo && !isDemo) {
      await update($, selfTitle, () => '')
      await loadTitle($)
    }
    await openPane($)
    return { text: t.opened }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    const result = await next(e)
    await update($, isPaneOpen, () => false)
    return result
  })

  // 입력창 아래 상태 줄의 버튼. 다른 mod(◨, RC, ✓)의 버튼은 앞에 그대로 둔다.
  // 한글 라벨은 상태 줄 높이에서 아래가 잘린다(checkbot-session). 기호와 숫자만 쓴다
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const below = await next(e)
    if (e.surface !== 'desktop' || (await read($, isIconHidden))) return below
    const { Box, Button } = $.ui.resolve(e)
    const isOpen = await read($, isPaneOpen)
    const label = `${iconLabel(await read($, snap))}${isOpen ? ' ▾' : ''}`

    return (
      <Box flexDirection="row">
        {below}
        <Button key="ram-toggle" label={label} dimColor onPress={() => background(togglePane($))} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const t = STRINGS[await read($, lang)]
    const s = await read($, snap)
    const message = await read($, note)
    const confirming = await read($, isConfirming)
    const isSetting = await read($, isSettingsOpen)
    const isHidingIcon = await read($, isIconHidden)
    const title = await read($, selfTitle)
    const sessions = s ? [...s.sessions].sort((a, b) => Number(b.pid === s.self) - Number(a.pid === s.self) || b.b - a.b) : []
    const sesTotal = sessions.reduce((a, x) => a + x.b, 0)
    const noteText =
      message?.code === 'restartFailed' ? t.restartFailed(message.exitCode) : message ? t[message.code] : null

    // 네 덩어리: 앱 화면 · 가상 머신 · 세션 n개, 그리고 따로 떨어진 맨 아래 앱 재시작
    return (
      <Box flexDirection="column" gap="sm" minHeight="100%">
        <Box flexDirection="row" alignItems="center">
          <Box flexGrow={1}>
            <Text bold>{s ? t.total(gb(total(s))) : t.measuring}</Text>
          </Box>
          <Button key="settings" label={GEAR} plain onPress={() => background(toggleSettings($))} />
        </Box>
        {isSetting && (
          <Box flexDirection="column" gap="xs" borderStyle="round" borderColor={BORDER} paddingX={1}>
            <Text bold>{t.settings}</Text>
            <Box flexDirection="row" flexWrap="wrap">
              <Button key="language" label={t.otherLanguage} onPress={() => background(toggleLang($))} />
              <Button key="refresh" label={t.refresh} onPress={() => background(refresh($, true))} />
              <Button
                key="icon"
                label={isHidingIcon ? t.showIcon : t.hideIcon}
                onPress={() => background(toggleIcon($))}
              />
            </Box>
          </Box>
        )}
        {noteText && <Text dimColor>{noteText}</Text>}
        {s && (
          <Box flexDirection="row" alignItems="center" borderStyle="round" borderColor={BORDER} paddingX={1}>
            <Box flexDirection="column" flexGrow={1} flexShrink={1}>
              <Text bold>{t.app}</Text>
              <Text dimColor>{t.appDetail}</Text>
            </Box>
            <Text bold>{gb(s.app)}</Text>
          </Box>
        )}
        {s && (
          <Box flexDirection="row" alignItems="center" borderStyle="round" borderColor={BORDER} paddingX={1}>
            <Box flexDirection="column" flexGrow={1} flexShrink={1}>
              <Text bold>{t.vm}</Text>
              <Text dimColor>
                <Text color={s.vmOn ? ON_COLOR : IDLE_COLOR}>{s.vmOn ? t.vmOn : t.vmOff}</Text>
                {` · ${t.vmDetail}`}
              </Text>
            </Box>
            <Text bold>{s.vmOn ? gb(s.vm) : '-'}</Text>
          </Box>
        )}
        {s && (
          <Box flexDirection="column" gap="xs" borderStyle="round" borderColor={BORDER} paddingX={1}>
            <Box flexDirection="row" alignItems="center">
              <Box flexGrow={1}>
                <Text bold>{t.sessions(sessions.length)}</Text>
              </Box>
              <Text bold>{gb(sesTotal)}</Text>
            </Box>
            {sessions.map(x => {
              const isSelf = x.pid === s.self
              return (
                <Box flexDirection="row" alignItems="center">
                  <Box flexDirection="column" flexGrow={1} flexShrink={1}>
                    <Text color={isSelf ? CURRENT_COLOR : undefined}>{isSelf && title ? title : t.session(x.pid)}</Text>
                    <Text dimColor>
                      {`pid ${x.pid} · ${t.withTools}`}
                      {isSelf && <Text color={CURRENT_COLOR}> · {t.here}</Text>}
                    </Text>
                  </Box>
                  <Text color={isSelf ? CURRENT_COLOR : undefined}>{gb(x.b)}</Text>
                </Box>
              )
            })}
          </Box>
        )}
        {s && <Text dimColor>{t.footer(new Date(s.at).toLocaleTimeString(t === STRINGS.ko ? 'ko-KR' : 'en-US'))}</Text>}
        <Box flexGrow={1} />
        {/* 테두리·제목 없이 버튼 하나와 짧은 설명 (2026-11-06 사용자 요청) */}
        <Box flexDirection="column" gap="xs" alignItems="flex-start">
          <Button
            key="restart"
            label={confirming ? t.restartConfirmButton : t.restart}
            variant={confirming ? 'primary' : undefined}
            onPress={() => background(restart($))}
          />
          <Text dimColor>{confirming ? t.restartConfirmDetail : t.restartDetail}</Text>
          {confirming && <Text color={CURRENT_COLOR}>{t.restartWarning}</Text>}
        </Box>
      </Box>
    )
  })
}
