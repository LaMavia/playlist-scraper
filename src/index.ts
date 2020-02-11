import cl from 'cluster'
import pptr from 'puppeteer'
import * as Playlist from './playlist'
import * as YT from './youtube'
import * as Spotify from './spotify'
import * as Download from './download'
import { log as mklog, log, wait, logTable, send, uuid, padString } from './util'
import inq from 'inquirer'
import fs from 'fs-extra'
import { resolve } from 'path'
import { load_env, num, bool } from './env'
import { cpus } from 'os'
import { Message, MessageType } from './message'

load_env()
const main = () => new Promise(async (res, rej) => {
  const [url_or_id, out, repeat_] = process.argv.slice(2)
  const repeat = ['t', 'T', 'true', 'True', 'y', 'Y', 'Yes', '1'].includes(
    repeat_
  )

  if (!url_or_id || !out)
    return console.log(`
      HOW TO USE: <url or playlist_id> <output_path> <repeat?>
    `)

  // -------- Prepare the dir -------- //
  await fs.mkdir(resolve(process.cwd(), out)).catch(e => {
    console.error(`Error making ${out}; ${e}`)
  })

  const id = Spotify.getID(url_or_id)

  let { items } = await Playlist.scrapePlaylist(id).catch(r => {
    console.error(r)
    return { items: [] } as Spotify.PlaylistResponse
  })
  const tracks = items.map(x => ({
    __id: uuid(),
    ...x.track,
  }))

  const totalItems = items.length
  let downloaded: Spotify.Track[] = []
  const processing = new Map<string, string>()

  const display = () => {
    console.clear()
    logTable(
      [
        `[${tracks.length}] Left`,
        `[${downloaded.length}/${totalItems}] Downloaded`,
      ],
      [tracks.map(t => t.name), downloaded.map(t => t.name)]
    )

    processing.forEach((v, k) =>
      console.log(padString(v, process.stdout.columns / 3 * 2))
    )
  }

  cl.on("exit", (w, c, sig) => {
    if(sig != "SIGKILL" && c != 0) {
      w.kill()
      cl.fork()
    }
  })

  cl.on('message', (w, m: Message) => {
    switch (m.type) {
      case MessageType.End:
        {
          w.kill()
          if (Object.keys(cl.workers).length === 0) {
            console.log('\nClosing the browser')
            res()
          }
        }
        break
      case MessageType.Result:
        {
          processing.delete(m.track.__id)
          if (m.ok) downloaded.push(m.track)
          else tracks.unshift(m.track)
          const nextTrack = tracks.pop()
          if (nextTrack) 
            w.send({
              type: MessageType.Order,
              track: nextTrack,
            } as Message)
          else 
            w.send({
              type: MessageType.End,
            } as Message)
        }
        break
      case MessageType.Status:
        {
          m.track &&
            processing.set(
              m.track.__id,
              `[${m.progress}] ${m.track.name}`
            )
          display()
        }
        break
      case MessageType.Start:
        {
          const nextTrack = tracks.pop()

          w.send({
            type: MessageType.Order,
            track: nextTrack,
          } as Message)
        }
        break
    }
  })

  for (const _ in new Array(Math.min(3, cpus().length)).fill(0)) {
    const w = cl.fork({
      __OUTPUT__: out,
    })
  }

  display()
})

const setupBrowser = () =>
  pptr.launch({
    headless: true,
    timeout: num('GOTO'),
    args: ['--lang=en-US,en'],
  })

// Resolves when gets an empty message
const makeScraper = () =>
  new Promise(async (res, rej) => {
    const browser = await setupBrowser()
    process.on("beforeExit", () => {
      browser.process().kill("SIGKILL")
    })
    process.on('message', async (msg: Message) => {
      try {
        switch (msg.type) {
          case MessageType.End:
            {
              await browser.close().then(() => {
                send({
                  type: MessageType.End,
                })
              }).then(res)
            }
            break
          case MessageType.Order:
            {
              if (!msg.track) {
                send({
                  type: MessageType.End
                })
                return res()
              }
              const ytTrack = await YT.scrapeSearch(msg.track, browser)
              ytTrack.album = msg.track.album
              const ok = await Download.download(
                ytTrack,
                process.env['__OUTPUT__'] || process.cwd(),
                browser
              )
                .then(() => true)
                .catch(() => false)
              send({
                type: MessageType.Result,
                ok,
                finish: false,
                track: ytTrack,
              })
            }
            break
        }

        if (browser.isConnected())
          for (const page of (await browser.pages().catch(() => [])).slice(1) || []) {
            !page.isClosed() &&
              (await page.close().catch(_ => {
                console.log(
                  'Error closing a page, but keep calm and scrape on!'
                )
              }))
          }
      } catch (err) {
        rej(err)
      }
    })

    send({
      type: MessageType.Start,
    })
  })
;(async () => {
  if (cl.isMaster) await main()
  else {
    await makeScraper().then(() => {
      process.exit(0)
    })
  }
})()
