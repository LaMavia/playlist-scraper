import pptr from 'puppeteer'

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
