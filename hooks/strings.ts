import type { Lang } from '../types'

type Strings = {
  paneTitle: string
  demoTitle: string
  commandDescription: string
  opened: string
  closed: string
  total: (gb: string) => string
  measuring: string
  measureFailed: string
  settings: string
  otherLanguage: string
  refresh: string
  hideIcon: string
  showIcon: string
  app: string
  appDetail: string
  vm: string
  vmOn: string
  vmOff: string
  vmDetail: string
  sessions: (n: number) => string
  session: (pid: number) => string
  withTools: string
  here: string
  restart: string
  restartDetail: string
  restartConfirmDetail: string
  restartConfirmButton: string
  restartWarning: string
  restarting: string
  restartFailed: (code: number) => string
  footer: (time: string) => string
}

export const STRINGS: Record<Lang, Strings> = {
  ko: {
    paneTitle: 'Claude 메모리',
    demoTitle: '메모리 패널 만들기',
    commandDescription: 'Claude 메모리 패널을 열거나 닫는다',
    opened: 'Claude 메모리 패널을 열었어요.',
    closed: 'Claude 메모리 패널을 닫았어요.',
    total: gb => `모두 ${gb}`,
    measuring: '재는 중…',
    measureFailed: '측정하지 못했어요.',
    settings: '설정',
    otherLanguage: 'English',
    refresh: '새로 고침',
    hideIcon: '입력창 아래 아이콘 숨기기',
    showIcon: '입력창 아래 아이콘 보이기',
    app: '앱 화면',
    appDetail: '창·화면 그리기·네트워크',
    vm: '가상 머신',
    vmOn: '● 켜짐',
    vmOff: '○ 꺼짐',
    vmDetail: 'Cowork 작업용',
    sessions: n => `세션 ${n}개`,
    session: pid => `세션 (pid ${pid})`,
    withTools: '도구 포함',
    here: '지금 이 세션',
    restart: '앱 재시작',
    restartDetail: '앱을 껐다 켜서 메모리를 비워요.',
    restartConfirmDetail: '5초 안에 한 번 더 누르면 시작해요.',
    restartConfirmButton: '정말 재시작',
    restartWarning: '모든 세션이 끊기고 가상 머신도 꺼졌다 켜져요.',
    restarting: '곧 앱이 꺼졌다 다시 켜져요…',
    restartFailed: code => `재시작하지 못했어요 (코드 ${code}).`,
    footer: time => `${time} 기준 · 30초마다 저절로 새로 고침.`,
  },
  en: {
    paneTitle: 'Claude memory',
    demoTitle: 'Build a memory panel',
    commandDescription: 'Open or close the Claude memory panel',
    opened: 'Opened the Claude memory panel.',
    closed: 'Closed the Claude memory panel.',
    total: gb => `Total ${gb}`,
    measuring: 'Measuring…',
    measureFailed: 'Could not measure.',
    settings: 'Settings',
    otherLanguage: '한국어',
    refresh: 'Refresh',
    hideIcon: 'Hide icon below the prompt',
    showIcon: 'Show icon below the prompt',
    app: 'App window',
    appDetail: 'Window, drawing, network',
    vm: 'Virtual machine',
    vmOn: '● on',
    vmOff: '○ off',
    vmDetail: 'for Cowork tasks',
    sessions: n => `${n} session${n === 1 ? '' : 's'}`,
    session: pid => `Session (pid ${pid})`,
    withTools: 'tools included',
    here: 'this session',
    restart: 'Restart app',
    restartDetail: 'Quit and reopen the app to free memory.',
    restartConfirmDetail: 'Press again within 5 seconds to start.',
    restartConfirmButton: 'Really restart',
    restartWarning: 'Every session stops, and the virtual machine restarts too.',
    restarting: 'The app will quit and reopen shortly…',
    restartFailed: code => `Could not restart (code ${code}).`,
    footer: time => `As of ${time} · refreshes every 30 seconds.`,
  },
}
