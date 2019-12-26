import * as YT from './youtube'
import axios, { AxiosResponse } from 'axios'
import fs from 'fs-extra'
import { resolve } from 'path'
import {
  wait,
  click,
  keep_going,
  log as mklog,
  LogFunction,
  send,
} from './util'
import pptr from 'puppeteer'
import { clearInterval } from 'timers'
import { num } from './env'
import { Message, MessageType } from './message'

const waitForUrl = (
  page: pptr.Page,
  buttonFailTimeout: NodeJS.Timeout,
  downloadClicker: NodeJS.Timeout
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
          // log(`Failed to download ${track.name}`)
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
        const dist = fs.createWriteStream(resolve(download_path), {
          encoding: 'utf-8',
        })

        const total = +r.headers['content-length']
        let progress = 0
        const make_progress = () => {
          const percent = ((progress / total) * 100).toFixed(1)
          return `${percent.length >= 3 ? percent : '0' + percent}%`
        }
        let slow_crash = setTimeout(() => {
          fs.removeSync(download_path)
          r.data.destroy()
          dist.destroy()
          rej(true)
        }, num('SLOW_CRASH'))

        r.data.on(
          'close',
          () =>
            !page.isClosed() &&
            page
              .close()
              .then(res)
              .catch(e => {
                if (/closeTarget/gi.test(String(e))) return

                send({
                  type: MessageType.Status,
                  ok: false,
                  err: String(e),
                  progress: make_progress(),
                  track,
                })
              })
              .finally(() => clearTimeout(slow_crash))
        )

        r.data.on('data', (c: any) => {
          progress += c.length
          // -------- Refresh iff is a major download -------- //
          if (c.length / total > 0.00001) {
            slow_crash.refresh()
          }

          // Prevents flickering
          if (c.length/total > 0.00035) {
            send({
              type: MessageType.Status,
              ok: true,
              progress: make_progress(),
              track,
              err: null,
            })
          }
        })

        // -------- Check for the integrity of the download -------- //
        dist.on('close', () => {
          dist.cork()
          progress == total ? res() : (fs.removeSync(download_path), rej(true))
        })

        return r.data.pipe(dist)
      })
      .catch(rej)
  })

// @ts-ignore
export const download = async (
  track: YT.Track,
  out: string,
  browser: pptr.Browser
) =>
  new Promise<void>(async (res, rej) => {
    send({
      type: MessageType.Status,
      err: null,
      ok: true,
      progress: '2conv',
      track,
    })
    const page = await browser.newPage()

    const selectors = {
      urlInput: 'input[name=video_url]',
      submitButton:
        '#layout > header > div.container.header__container > div.convert-form > div.container > div:nth-child(2) > div > button',
      downloadButton:
        '#layout > header > div.container.header__container > div.convert-form > div > div.download__buttons > button',
    }

    page.on('dialog', d => d.dismiss())
    const x = await keep_going(page, `https://2conv.com/pl12/`, 5).catch(
      () => true
    )
    if (x) return rej(true)

    await page.waitForSelector(selectors.urlInput).catch(rej)
    await page.type(selectors.urlInput, track.url)
    // log('Have just typed-in the url')
    await click(page, selectors.submitButton)

    // log('Clicked the "Process" button')
    const buttonFailTimeout = setTimeout(rej, num('BUTTON_FAIL'))
    await page.setRequestInterception(true)
    const downloadClicker = setInterval(async () => {
      await click(page, selectors.downloadButton)
    }, num('BUTTON_FAIL') / 4)

    const url = await waitForUrl(
      page,
      buttonFailTimeout,
      downloadClicker
    ).catch(() => {
      rej()
      return ''
    })
    await downloadURL(url, track, page, out)
      .then(res)
      .catch(rej)

    // log('Clicked the "Download" button')
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
