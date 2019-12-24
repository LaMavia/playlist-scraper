import cl from 'cluster'
import pptr from 'puppeteer'
import * as Playlist from './playlist'
import * as YT from './youtube'
import * as Spotify from './spotify'
import * as Download from './download'
import { log as mklog, log, wait, logTable } from './util'
import inq from 'inquirer'
import fs from 'fs-extra'
import { resolve } from 'path'
import { load_env, num, bool } from './env'
import { cpus } from 'os'

interface Message {
  ok: boolean
  finish: boolean
  track?: YT.Track
}

load_env()
const main = async () => {
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
  const ui = new inq.ui.BottomBar()

  ui.updateBottomBar('Fetching the Spotify API')
  let { items } = await Playlist.scrapePlaylist(id).catch(r => {
    console.error(r)
    return { items: [] } as Spotify.PlaylistResponse
  })
  const tracks = items.map(x => x.track)
  ui.updateBottomBar(`Fetched ${items.length} items from the Spotify API`)

  /*const browser = await pptr
    .launch({
      headless: !false,
      timeout: num('GOTO'),
      args: ['--incognito', '--lang=en-US,en'],
    })
    .catch(r => {
      console.error(`Error launching the Browser; ${r}`)
    })
  if (!browser) return*/

  const totalItems = items.length
  let downloaded: Spotify.Track[] = []

  const display = () => {
    console.clear()
    logTable(
      [
        `[${tracks.length}] Left`,
        `[${downloaded.length}/${totalItems}] Downloaded`,
      ],
      [tracks.map(t => t.name), downloaded.map(t => t.name)]
    )
  }

  cl.on('message', (w, m: Message) => {
    if (!m.ok && m.track) tracks.unshift(m.track)
    else if (m.ok && m.track) downloaded.push(m.track)
    if (m.finish) {
      w.kill()
      if (Object.keys(cl.workers).length === 0) {
        console.log('\nClosing the browser')
        process.exit(0)
      }
    } else {
      const nextTrack = tracks.pop()
      w.send({
        ok: Boolean(nextTrack),
        finish: downloaded.length === totalItems,
        track: nextTrack,
      } as Message)
    }

    display()
  })

  for (const _ in new Array(Math.min(3, cpus().length)).fill(0)) {
    const w = cl.fork({
      __OUTPUT__: out,
    })
    display()
  }
}

const setupBrowser = () =>
  pptr.launch({
    headless: !true,
    timeout: num('GOTO'),
    args: ['--incognito', '--lang=en-US,en'],
  })

// Resolves when gets an empty message
const makeScraper = () =>
  new Promise(async (res, rej) => {
    const browser = await setupBrowser()
    process.on('message', async (msg: Message) => {
      try {
        if (msg.finish && !msg.track) {
          await browser.close()
          process.send &&
            process.send({
              ok: false,
              track: undefined,
              finish: true,
            } as Message)
          res()
        } else if (msg.track) {
          const ytTrack = await YT.scrapeSearch(msg.track, browser)
          ytTrack.album = msg.track.album
          const ok = await Download.download(
            ytTrack,
            process.env['__OUTPUT__'] || process.cwd(),
            browser,
            0,
            0
          )
            .then(() => true)
            .catch(() => false)
          process.send &&
            process.send({
              ok,
              finish: false,
              track: ytTrack,
            } as Message)
        }

        for (const page of (await browser.pages()).slice(1) || []) {
          !page.isClosed() &&
            (await page.close().catch(_ => {
              console.log('Error closing a page, but keep calm and scrape on!')
            }))
        }
      } catch (err) {
        rej(err)
      }
    })

    process.send &&
      process.send({
        ok: true,
        track: undefined,
        finish: false,
      } as Message)
  })
;(async () => {
  if (cl.isMaster) await main()
  else {
    await makeScraper()
  }
})()

/*
const log = mklog(completedCount, totalItems, ui)

    // -------- Pops the first item off the stack -------- //
    const t = (items.shift() as any) as { track: Spotify.Track }
    if (!(t && t.track)) continue

    log(`Starting ${t.track.name}`)
    await YT.scrapeSearch(t.track, browser)
      .then((tr: YT.Track) => {
        try {
          log(`Got "${tr.name}"'s YT url`)
          tr.album = t.track.album

          // -------- Save the url for later -------- //
          // -------- Prevents extra yt-scraping -------- //
          Object.assign(t, {
            url: tr.url,
          })

          return Download.download(
            tr,
            out,
            browser,
            ui,
            completedCount,
            totalItems
          )
        } catch (err) {
          return log(err)
        }
      })
      .then(() => {
        completedCount++
        return log(`Downloaded ${t.track.name}`)
      })
      .catch(
        (t => (rep: boolean | undefined) => {
          log(`Error downloading ${t.track.name}`)
          // console.error(rep)
          if (repeat || rep || bool('REPEAT')) items.push(t)
        })(t)
      )

    if (completedCount == totalItems) break

    // -------- Close any rogue pages to prevent memory leaks -------- //
    for (const page of (await browser.pages()).slice(1) || []) {
      !page.isClosed() &&
        (await page.close().catch(_ => {
          ui.updateBottomBar(
            'Error closing a page, but keep calm and scrape on!'
          )
        }))
    } */
