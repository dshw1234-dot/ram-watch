import type { Snap } from '../types'

const GB = 1024 ** 3

// `/ram-watch demo`의 예시 숫자. 16GB PC에서 Claude 가 약 9GB(◑)를 쓰는 모습
export function demoSnap(at: number): Snap {
  return {
    vmOn: true,
    vm: 4.01 * GB,
    app: 3.1 * GB,
    sessions: [
      { pid: 14040, b: 0.66 * GB },
      { pid: 14708, b: 0.64 * GB },
      { pid: 1208, b: 0.6 * GB },
    ],
    self: 14040,
    ram: 16 * GB,
    at,
  }
}
