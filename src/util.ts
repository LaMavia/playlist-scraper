import pptr from 'puppeteer'
import { num } from './env'
import { Message } from './message'

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

export const padString = (s: string, len: number) => {
  const padded = s.padEnd(len)
  const sub = padded.substr(0, len)

  return sub.length < padded.length
    ? `${sub.substr(0, sub.length - 3)}...`
    : sub
}

export type LogFunction = (msg: string) => void
export const log = (i: number, t: number, ui: any) => (msg: string) =>
  ui.updateBottomBar(`[${i}/${t}] ${msg}`)

export const logTable = (labels: string[], content: string[][]) => {
  console.clear()
  process.stdout.clearScreenDown()
  process.stdout.cursorTo(0)
  const allLengths = ([] as string[])
    .concat(labels, content.reduce((acc, x) => acc.concat(x), [] as string[]))
    .map(x => x.length)
  // Find max len
  const maxLen = process.stdout.columns / 2 - 2
  const contentLength = Math.max(content[0].length, content[1].length) + 1
  const yLimit = 55
  const maxY = Math.min(yLimit, contentLength)

  for (let y = -1; y <= maxY; y++) {
    if (y == -1) {
      const border = '='.repeat(process.stdout.columns - 1) + '\n'
      process.stdout.write(border)
      process.stdout.write(
        `${padString(labels[0], maxLen)} || ${padString(labels[1], maxLen)}\n`
      )
      process.stdout.write(border)
    } else {
      process.stdout.write(
        `${padString(
          y == yLimit && content[0].length > yLimit ? '...' : (content[0][y] || ''),
          maxLen
        )} || ${padString(
          y == yLimit && content[1].length > yLimit ? '...' : (content[1][y] || ''),
          maxLen
        )}\n`
      )
    }
  }
  process.stdout.write('\n')
}

export const send = (msg: Message) => (process.send ? process.send(msg) : false)
export function uuid(a?: any) {
  return a
    ? (a ^ ((Math.random() * 16) >> (a / 4))).toString(16)
     // @ts-ignore
    :  ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, uuid)
}
