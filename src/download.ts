import * as YT from './youtube'
import axios, { AxiosResponse } from 'axios'
import fs from 'fs-extra'
import { resolve } from 'path'
import { wait, click, keep_going, log as mklog } from './util'
import pptr from 'puppeteer'
import { clearInterval } from 'timers'
import { num } from './env'

const watch_id_rex = /v=([-_\w]+)/i
const get_id = (t: YT.Track) => {
  const matches = t.url.match(watch_id_rex)
  if (!matches) throw new Error(`Error matching "${t.url}" for id`)

  return matches[1] as string
}

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
    page.on('dialog', d => d.dismiss())

    let errorGoing = await keep_going(page, `https://2conv.com/`, 5).catch(
      () => true
    )
    if (errorGoing) return rej(true)

    const download_path = resolve(
      out,
      `${track.name.replace(/[\\\/]/gi, '')}.mp3`
    )

    await page
      .waitForSelector(
        '#layout > header > div.container.header__container > div.convert-form > div.container > div.convert-form__input-container > label > input'
      )
      .catch(rej)
    await page.type(
      '#layout > header > div.container.header__container > div.convert-form > div.container > div.convert-form__input-container > label > input',
      track.url,
      {
        delay: 5,
      }
    )

    log('Have just typed-in the url')

    await click(
      page,
      '#layout > header > div.container.header__container > div.convert-form > div.container > div:nth-child(2) > div > button'
    )

    log('Clicked the "Process" button')
    const buttonFailTimeout = setTimeout(rej, num('BUTTON_FAIL'))

    await page.setRequestInterception(true)

    page
      .on('request', async e => {
        if (e.url().match(/\.mp3/i)) {
          await e.abort('blockedbyclient')
          clearTimeout(buttonFailTimeout)
          axios({
            url: e.url(),
            method: 'GET',
            responseType: 'stream',
          })
            .then(r => {
              log(`Downloading ${track.name}`)
              clearInterval(downloadClicker)
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
                    .then(() => {
                      clearTimeout(slow_crash)
                      log(`Downloaded ${track.name}`)
                      res()
                    })
                    .catch(_ => {
                      console.log('🐱')
                    }))
              })

              r.data.on('data', (c: any) => {
                downloadedSize += c.length
                // -------- Refress iff is a major download -------- //
                if (c.length / totalSize > 0.00001) slow_crash.refresh()
                log(
                  `${track.name} [${(
                    (downloadedSize / totalSize) *
                    100
                  ).toFixed(2)}%]`
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

    const downloadClicker = setInterval(async () => {
      await click(
        page,
        '#layout > header > div.container.header__container > div.convert-form > div > div.download__buttons > button'
      ).then(() => buttonFailTimeout.refresh())

      log('Clicked the "Download" button')
    }, num('BUTTON_FAIL') / 4)

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
