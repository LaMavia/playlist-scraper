import pptr from 'puppeteer'

export const wait = (ms: number) => new Promise(res => setTimeout(res, ms))
export const click = (page: pptr.Page, selector: string, n = 0): Promise<any> =>
  page
    .waitForSelector(selector)
    .then(() => page.click(selector))
    .catch(e => click(page, selector))

export const keep_going = (page: pptr.Page, url: string, toleration: number) =>
  new Promise(async (res, rej) => {
    const wait_until = 'load',
      timeout = 30000
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

    res()
  })
