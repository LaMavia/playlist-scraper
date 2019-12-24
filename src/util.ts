import pptr from 'puppeteer'
import { num } from './env'

type reject = <T>(reason?: T) => void

export const wait = (ms: number) => new Promise(res => setTimeout(res, ms))
export const click = (
  page: pptr.Page,
  selector: string,
  rej?: reject
): Promise<any> =>
  page
    .waitForSelector(selector, {
      timeout: num('GOTO'),
    })
    .then(() => page.click(selector))
    .catch(_ => rej && rej())

// -------- Returns `false` if failed to go to the url -------- //
export const keep_going = (page: pptr.Page, url: string, toleration: number) =>
  new Promise(async (res, rej) => {
    const wait_until = 'networkidle2',
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
            page
              .reload({
                timeout,
                waitUntil: wait_until,
              })
              .catch(() => {
                /**/
              })
          return false
        })
      if (++i > toleration) rej(new Error("Page ain't loading"))
    }

    res(false)
  })

export type LogFunction = (msg: string) => void
export const log = (i: number, t: number, ui: any) => (msg: string) =>
  ui.updateBottomBar(`[${i}/${t}] ${msg}`)

export const logTable = (labels: string[], content: string[][]) => {
  process.stdout.clearScreenDown()
  process.stdout.cursorTo(0)
  const allLengths = ([] as string[])
    .concat(labels, content.reduce((acc, x) => acc.concat(x), [] as string[]))
    .map(x => x.length)
  // Find max len
  const maxLen = Math.min(Math.max(...allLengths), process.stdout.columns / 2)
  const minLen = Math.min(Math.min(...allLengths), process.stdout.columns / 2)

  for (let y = -1; y < Math.max(content[0].length, content[1].length) + 1; y++) {
    if (y == -1) {
      process.stdout.write('='.repeat(process.stdout.columns))
      process.stdout.write(
        `${labels[0].padEnd(maxLen)} || ${labels[1].padEnd(maxLen)}\n`
      )
      process.stdout.write('='.repeat(process.stdout.columns))
    } else {
      process.stdout.write(
        `${(content[0][y] || '').padEnd(maxLen)} || ${(
          content[1][y] || ''
        ).padEnd(maxLen)}\n`
      )
    }
  }
}
