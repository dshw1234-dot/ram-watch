import { expect, test } from 'claude-code/testing'

import { encode, FIND_SELF, iconLabel, MEASURE } from './register'

const PANE = {
  plugin: 'ram-watch',
  component: 'Pane',
  requestId: 'ram-watch',
  props: {
    title: 'Claude 메모리',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const GB = 1024 ** 3
const MEASURED = { vmOn: true, vm: 4 * GB, app: 3 * GB, sessions: [{ pid: 1, b: GB }, { pid: 2, b: GB }], self: 2, ram: 32 * GB }

test('encode matches PowerShell -EncodedCommand', () => {
  expect(encode('Hi')).toBe('SABpAA==')
  expect(encode('a')).toBe('YQA=')
  expect(encode('가')).toBe('AKw=')
})

// 세션 둘이 같은 TEMP 를 볼 때: 첫 세션만 재고, 둘째는 파일을 읽어 쓰고 자기 pid 만 찾는다
for (const isFresh of [false, true]) {
  test(`shared measurement: ${isFresh ? 'a fresh file is reused' : 'a missing file is measured and written'}`, async ($, on) => {
    const files: Record<string, string> = {}
    if (isFresh) files['C:/T/claude-ram-watch/snap.json'] = JSON.stringify({ ...MEASURED, self: undefined, at: Date.now() })
    const ran: string[] = []
    on('command.register', () => ({ value: { command: 'ram-watch' } }))
    on('ui.panes', () => ({ value: [] }))
    on('store.get', () => ({ value: undefined }))
    on('tool.check', () => ({ decision: 'deny' }))
    on('clock.every', () => ({ value: undefined }))
    on('env.get', (_, e) => ({ value: e.name === 'TEMP' ? 'C:/T' : undefined }))
    const key = (path: string) => path.replaceAll('\\', '/')
    on('fs.read', (_, e) => (key(e.path) in files ? { value: files[key(e.path)]! } : { deny: 'ENOENT' }))
    on('fs.write', (_, e) => {
      files[key(e.path)] = e.text
      return { value: undefined }
    })
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    on('process.run', (_, e) => {
      const script = e.argv[4] === encode(FIND_SELF) ? 'self' : e.argv[4] === encode(MEASURE) ? 'measure' : '?'
      ran.push(script)
      const stdout = script === 'self' ? '2' : JSON.stringify({ ...MEASURED, self: 1 })
      return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })

    await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    expect((await ui.find({ type: 'Text', text: /^모두|^Total/ }))?.text).toMatch(/9\.00 GB/)
    // 잰 세션은 측정 결과에서 자기 pid(1)를 얻고, 파일을 읽은 세션은 따로 한 번 찾는다(2)
    expect(ran).toEqual(isFresh ? ['self'] : ['measure'])
    expect((await ui.find({ type: 'Text', text: /this session|지금 이 세션/ }))?.text).toContain(isFresh ? 'pid 2' : 'pid 1')
    if (!isFresh) expect(JSON.parse(files['C:/T/claude-ram-watch/snap.json']!).vm).toBe(4 * GB)
    await ui.unmount()
  })
}

test('a stored English choice wins over the Korean setting', async ($, on) => {
  on('command.register', () => ({ value: { command: 'ram-watch' } }))
  on('ui.panes', () => ({ value: [] }))
  on('store.get', (_, e) => ({ value: e.key === 'lang' ? 'en' : undefined }))
  on('config.list', () => ({ value: [{ key: 'language', value: 'korean' }] as never }))
  on('tool.check', () => ({ decision: 'deny' }))
  on('clock.every', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', () => ({
    value: { exitCode: 0, stdout: JSON.stringify(MEASURED), stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^Total/ }))?.text).toBe('Total 9.00 GB')
  expect((await ui.find({ type: 'Text', text: /^2 sessions/ }))?.text).toBe('2 sessions')
  expect((await ui.find({ type: 'Button', key: 'restart' }))?.props.label).toBe('Restart app')
  await ui.unmount()
})

test('the pane shows the VM, sessions, this session and total', async ($, on) => {
  on('command.register', () => ({ value: { command: 'ram-watch' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('store.get', () => ({ value: undefined }))
  on('config.list', () => ({ value: [{ key: 'language', value: 'korean' }] as never }))
  on('tool.check', () => ({ decision: 'allow' }))
  on('clock.every', () => ({ value: undefined }))
  on('tool.call', () => ({ result: {}, text: JSON.stringify({ title: '메모리 mod 만들기' }) }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.run', () => ({
    value: { exitCode: 0, stdout: JSON.stringify(MEASURED), stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /^모두/ }))?.text).toBe('모두 9.00 GB')
    expect((await ui.find({ type: 'Text', text: /켜짐/ }))?.text).toContain('● 켜짐')
    expect((await ui.find({ type: 'Text', text: /^세션 2개/ }))?.text).toBe('세션 2개')
    expect((await ui.find({ type: 'Button', key: 'restart' }))?.props.label).toBe('앱 재시작')
    expect((await ui.find({ type: 'Text', text: /메모리 mod 만들기/ }))?.text).toBe('메모리 mod 만들기')
    expect((await ui.find({ type: 'Text', text: /지금 이 세션/ }))?.text).toContain('pid 2')
    await ui.unmount()
  }
})

test('the icon fills with the share of PC memory and shows one number', () => {
  const s = { ...MEASURED, at: 0 }
  expect(iconLabel(null)).toBe('◌')
  expect(iconLabel({ ...s, ram: 128 * GB })).toBe('○ 9.0')
  expect(iconLabel(s)).toBe('◔ 9.0')
  expect(iconLabel({ ...s, ram: 16 * GB })).toBe('◑ 9.0')
  expect(iconLabel({ ...s, ram: 9 * GB })).toBe('● 9.0')
})

test('/ram-watch demo shows sample numbers and measures nothing', async ($, on) => {
  const ran: unknown[] = []
  on('command.register', () => ({ value: { command: 'ram-watch' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('store.get', () => ({ value: undefined }))
  on('config.list', () => ({ value: [{ key: 'language', value: 'korean' }] as never }))
  on('tool.check', () => ({ decision: 'deny' }))
  on('clock.every', () => ({ value: undefined }))
  on('process.run', (_, e) => {
    ran.push(e.argv)
    return { value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.command.run({ command: 'ram-watch', args: 'demo' } as never)
  const before = ran.length
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /메모리 패널 만들기/ }))?.text).toBe('메모리 패널 만들기')
  expect((await ui.find({ type: 'Text', text: /^모두/ }))?.text).toBe('모두 9.01 GB')
  expect(ran.length).toBe(before)
  await ui.unmount()
})
