export type Lang = 'ko' | 'en'

export type SessionMem = { pid: number; b: number }

export type Snap = {
  vmOn: boolean
  vm: number
  app: number
  sessions: SessionMem[]
  // 이 세션의 claude.exe pid. 찾지 못하면 0
  self: number
  // PC 전체 메모리(바이트). 아이콘 눈금에 쓴다
  ram: number
  at: number
}

// 언어를 바꿔도 따라 바뀌도록 글 대신 종류를 둔다
export type Note = { code: 'measureFailed' | 'restarting' } | { code: 'restartFailed'; exitCode: number }

declare module 'claude-code' {
  interface PluginState {
    'ram-watch': {
      snap: Shaped<Snap | null>
      note: Shaped<Note | null>
      isConfirming: boolean
      isPaneOpen: boolean
      isSettingsOpen: boolean
      isIconHidden: boolean
      selfTitle: string
      lang: Lang
    }
  }
}
