import * as ts from 'typescript'

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      BUTTON_FAIL: number
      GOTO: number
      REPEAT: boolean
      SLOW_CRASH: number
    }
  }
}
