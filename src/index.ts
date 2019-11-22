import pptr from 'puppeteer'
import * as Playlist from './playlist'
import * as YT from './youtube'
import * as Spotify from './spotify'
import * as Download from './download'
import { log as mklog, load_env } from './util'
import inq from 'inquirer'
import fs from 'fs-extra'
import { resolve } from 'path'

load_env()
;(async () => {
  const [url_or_id, out, repeat_] = process.argv.slice(2)
  const repeat = ['t', 'T', 'true', 'True', 'y', 'Y', 'Yes', '1'].includes(
    repeat_
  )

  if (!url_or_id || !out)
    return console.log(`
      HOW TO USE: <url or playlist_id> <output_path> <repeat?>
    `)

  // -------- Prepare the dir -------- //
  await fs.mkdir(resolve(process.cwd(), out)).catch(_ => {
    /* Dir already exists */
  })

  const id = Spotify.getID(url_or_id)
  const ui = new inq.ui.BottomBar()

  ui.updateBottomBar('Fetching the Spotify API')
  let { items } = await Playlist.scrapePlaylist(id).catch(r => {
    console.error(r)
    return { items: [] } as Spotify.PlaylistResponse
  })
  ui.updateBottomBar(`Fetched ${items.length} items from the Spotify API`)

  const browser = await pptr.launch({
    headless: !false,
    timeout: +process.env['GOTO'],
  })

  let completedCount = 0
  const totalItems = items.length

  while (items.length > 0) {
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
        log(`Downloaded ${t.track.name}`)
      })
      .catch(
        (t => (rep: boolean | undefined) => {
          log(`Error downloading ${t.track.name}`)
          if (repeat || rep || process.env['REPEAT']) items.push(t)
        })(t)
      )

    // -------- Close any rogue pages to prevent memory leaks -------- //
    for (const page of (await browser.pages()).slice(1)) {
      !page.isClosed() &&
        (await page.close().catch(_ => {
          ui.updateBottomBar(
            'Error closing a page, but keep calm and scrape on!'
          )
        }))
    }
  }

  await browser.close()
  return 0
})()
