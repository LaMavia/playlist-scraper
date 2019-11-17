import * as YT from './youtube'
import axios, { AxiosResponse } from 'axios'
import fs from 'fs-extra'
import { resolve } from 'path'
import { wait, click, keep_going } from './util'
import pptr from 'puppeteer'
import inq from 'inquirer'

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
  ui: any
) =>
  new Promise<void>(async (res, rej) => {
    const page = await browser.newPage()

    keep_going(page, `https://2conv.com/en2/converter/`, 20)

    const download_path = resolve(
      out,
      `${track.name.replace(/[\\\/]/gi, '')}.mp3`
    )

    await page.waitForSelector(
      '#layout > header > div.container.header__container > div.convert-form > div.container > div.convert-form__input-container > label > input',
      {
        timeout: 0,
      }
    )
    await page.type(
      '#layout > header > div.container.header__container > div.convert-form > div.container > div.convert-form__input-container > label > input',
      track.url,
      {
        delay: 5,
      }
    )

    await click(
      page,
      '#layout > header > div.container.header__container > div.convert-form > div.container > div:nth-child(2) > div > button'
    )

    page
      .on('request', async e => {
        if (e.url().match(/\.mp3/i)) {
          axios({
            url: e.url(),
            method: 'GET',
            responseType: 'stream',
          })
            .then(r => {
              ui.updateBottomBar(`Downloading ${track.name}`)
              const dist = fs.createWriteStream(resolve(download_path), {
                encoding: 'utf-8',
              })
              
              const totalSize = +r.headers['content-length']
              let downloadedSize = 0

              r.data.on('close', async () => {
                !page.isClosed() &&
                  (await page
                    .close()
                    .then(() => ui.updateBottomBar(`Downloaded ${track.name}`))
                    .catch(_ => {
                      console.log('🐱')
                    }))
                res()
              })

              r.data.on('data', (c: any) => {
                downloadedSize += c.length
                ui.updateBottomBar(
                  `${track.name} [${(downloadedSize / totalSize * 100).toFixed(2)}%]`
                )
              })

              return r.data.pipe(dist)
            })
            .catch(rej)
        }
      })
      .on('error', e => {
        console.log(`Page Error: ${e.message}`)
        return page.reload()
      })

    await click(
      page,
      '#layout > header > div.container.header__container > div.convert-form > div > div.download__buttons > button'
    )
  })
