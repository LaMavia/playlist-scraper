import * as YT from './youtube'
import axios, { AxiosResponse } from 'axios'
import fs from 'fs-extra'
import { resolve } from 'path'
import { wait, click, keep_going, log as mklog, LogFunction } from './util'
import pptr from 'puppeteer'
import { clearInterval } from 'timers'
import { num } from './env'

const watch_id_rex = /v=([-_\w]+)/i
const get_id = (t: YT.Track) => {
  const matches = t.url.match(watch_id_rex)
  if (!matches) throw new Error(`Error matching "${t.url}" for id`)

  return matches[1] as string
}

const waitForUrl = (
  page: pptr.Page,
  buttonFailTimeout: NodeJS.Timeout,
  downloadClicker: NodeJS.Timeout,
  log: LogFunction,
  track: YT.Track
) =>
  new Promise<string>((res, rej) => {
    page
      .on('request', async e => {
        if (e.url().match(/\.mp3/i)) {
          await e.abort('blockedbyclient')
          clearTimeout(buttonFailTimeout)
          clearInterval(downloadClicker)

          res(e.url())
        } else e.continue()
      })
      .on('response', async e => {
        if (e.url().match(/\.mp3/i) && !e.ok()) {
          log(`Failed to download ${track.name}`)
          await wait(500)
          rej(false)
        }
      })
      .on('error', e => {
        console.log(`Page Error: ${e.message}`)
        return page.reload()
      })
  })

const downloadURL = (
  url: string,
  track: YT.Track,
  log: LogFunction,
  page: pptr.Page,
  out: string
) =>
  new Promise<any>((res, rej) => {
    const download_path = resolve(
      out,
      `${track.name.replace(/[\\\/]/gi, '')}.mp3`
    )

    axios({
      url,
      method: 'GET',
      responseType: 'stream',
    })
      .then(r => {
        log(`Downloading ${track.name}`)
        const dist = fs.createWriteStream(resolve(download_path), {
          encoding: 'utf-8',
        })

        const totalSize = +r.headers['content-length']
        let downloadedSize = 0
        let slow_crash = setTimeout(() => {
          fs.removeSync(download_path)
          r.data.destroy()
          dist.destroy()
          rej(true)
        }, num('SLOW_CRASH'))

        r.data.on('close', async () => {
          !page.isClosed() &&
            (await page
              .close()
              .then(res)
              .catch(async e => {
                if (/closeTarget/gi.test(String(e))) return
                log(`Error while downloading: ${e}`)
                await wait(2000)
                console.log('🐱')
              })
              .finally(() => clearTimeout(slow_crash)))
        })

        r.data.on('data', (c: any) => {
          downloadedSize += c.length
          // -------- Refress iff is a major download -------- //
          if (c.length / totalSize > 0.00001) slow_crash.refresh()
          log(
            `${track.name} [${((downloadedSize / totalSize) * 100).toFixed(
              2
            )}%]`
          )
        })

        // -------- Check for the integrity of the download -------- //
        dist.on('close', () => {
          dist.cork()
          downloadedSize == totalSize
            ? res()
            : (fs.removeSync(download_path), rej(true))
        })

        return r.data.pipe(dist)
      })
      .catch(rej)
  })

// @ts-ignore
export const download = async (
  track: YT.Track,
  out: string,
  browser: pptr.Browser,
  ui: any,
  index: number,
  total: number
) =>
  new Promise<void>(async (res, rej) => {
    const log = mklog(index, total, ui)
    const page = await browser.newPage()

    const selectors = {
      urlInput:
        '#layout > header > div.container.header__container > div.convert-form > div.container > div.convert-form__input-container > label > input',
      submitButton:
        '#layout > header > div.container.header__container > div.convert-form > div.container > div:nth-child(2) > div > button',
      downloadButton:
        '#layout > header > div.container.header__container > div.convert-form > div > div.download__buttons > button',
    }

    page.on('dialog', d => d.dismiss())
    if (await keep_going(page, `https://2conv.com/`, 5).catch(() => true))
      return rej(true)

    await page.waitForSelector(selectors.urlInput).catch(rej)
    await page.type(selectors.urlInput, track.url)
    log('Have just typed-in the url')
    await click(page, selectors.submitButton)

    log('Clicked the "Process" button')
    const buttonFailTimeout = setTimeout(rej, num('BUTTON_FAIL'))
    await page.setRequestInterception(true)
    const downloadClicker = setInterval(async () => {
      await click(page, selectors.downloadButton)
    }, num('BUTTON_FAIL') / 4)

    const url = await waitForUrl(
      page,
      buttonFailTimeout,
      downloadClicker,
      log,
      track
    ).catch(() => {
      rej()
      return ''
    })
    await downloadURL(url, track, log, page, out)
      .then(res)
      .catch(rej)

    log('Clicked the "Download" button')
    buttonFailTimeout.refresh()

    // -------- Check for the unable-to-download monad -------- //
    const unableToDownload = await page
      .evaluate(() => {
        const modal = document.querySelector('.modal')
        if (modal) {
          return (
            // @ts-ignore
            modal.offsetParent ||
            window.getComputedStyle(modal).visibility == 'visible'
          )
        }
        return false
      })
      .catch(_ => true)

    if (unableToDownload) {
      rej(true)
    }
  })
