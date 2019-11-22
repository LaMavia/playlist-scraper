import pptr from 'puppeteer'
import dotenv from 'dotenv'

type reject = <T>(reason?: T) => void

export const wait = (ms: number) => new Promise(res => setTimeout(res, ms))
export const click = (
  page: pptr.Page,
  selector: string,
  rej?: reject
): Promise<any> =>
  page
    .waitForSelector(selector, {
      timeout: process.env['GOTO'],
    })
    .then(() => page.click(selector))
    .catch(_ => rej && rej())

// -------- Returns `false` if failed to go to the url -------- //
export const keep_going = (page: pptr.Page, url: string, toleration: number) =>
  new Promise(async (res, rej) => {
    const wait_until = 'load',
      timeout = 5000
    let fine = false
    let i = 0
    while (!fine) {
      fine = await page
        .goto(url, {
          timeout,
          waitUntil: wait_until,
        })
        .then(_ => true)
        .catch(_ => {
          !page.isClosed() &&
            page.reload({
              timeout,
              waitUntil: wait_until,
            })
          return false
        })
      if (++i > toleration) rej(new Error("Page ain't loading"))
    }

    res(false)
  })

export const log = (i: number, t: number, ui: any) => (msg: string) =>
  ui.updateBottomBar(`[${i}/${t}] ${msg}`)

export const load_env = () => {
  dotenv.config()

  // -------- Replace the missing env vars with the default ones -------- //
  const DEFAULT_ENV = {
    BUTTON_FAIL: 15000,
    GOTO: 5000,
    REPEAT: false,
    SLOW_CRASH: 5000,
  } as { [key: string]: any }

  for (const key in DEFAULT_ENV) {
    // @ts-ignore
    if (typeof process.env[key] == 'undefined')
      process.env[key] = DEFAULT_ENV[key]
    else
      switch (typeof DEFAULT_ENV[key]) {
        case 'number':
          // @ts-ignore
          process.env[key] = Number(process.env[key])
        case 'boolean':
          // @ts-ignore
          process.env[key] = Boolean(process.env[key])
      }

    console.log(`${key} = ${process.env[key]} [${typeof process.env[key]}]`)
  }
}
