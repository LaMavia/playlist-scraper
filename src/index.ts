import pptr from 'puppeteer'
import * as dotenv from 'dotenv'
import * as Playlist from './playlist'
import * as YT from './youtube'
import * as Spotify from './spotify'
import * as Download from './download'
import inq from 'inquirer'

dotenv.config()
;(async () => {
  const [url_or_id, out, repeat_] = process.argv.slice(2)
  const repeat = ['t', 'T', 'true', 'True', 'y', 'Y', 'Yes', '1'].includes(
    repeat_
  )

  const id = Spotify.getID(url_or_id)
  const status = new inq.ui.BottomBar()

  status.updateBottomBar('Fetching the Spotify API')
  let { items } = await Playlist.scrapePlaylist(id).catch(r => {
    console.error(r)
    return { items: [] } as Spotify.PlaylistResponse
  })
  status.updateBottomBar(`Fetched ${items.length} items from the Spotify API`)

  const browser = await pptr.launch({
    headless: !false,
  })

  let i = 0
  const len0 = items.length

  while (items.length > 0) {
    const t = (items.shift() as any) as { track: Spotify.Track }

    status.updateBottomBar(`[${i}/${len0}] Starting ${t.track.name}`)
    await YT.scrapeSearch(t.track, browser)
      .then(tr => {
        status.updateBottomBar(`[${i}/${len0}] Got "${tr.name}"'s YT url`)
        tr.album = t.track.album
        return Download.download(tr, out, browser, status)
      })
      .then(() => {
        i++
        status.updateBottomBar(`[${i}/${len0}] ${t.track.name}`)
      })
      .catch(
        (t => () => {
          console.log(`Error downloading ${t.track.name}`)
          if (repeat_) items.push(t)
          else {
            console.log(`Failed to download ${t.track.name}`)
          }
        })(t)
      )
  }
  /*
  while (items.length > 0) {
    await Promise.all(
      items.splice(0, at_once).map(t =>
        YT.scrapeSearch(t.track, browser)
          .then(tr => {
            tr.album = t.track.album
            return Download.download(tr, out, browser)
          })
          .then(() => {
            i++
            status.updateBottomBar(`[${i}/${len0}] ${t.track.name}`)
          })
          .catch(
            (t => () => {
              console.log(`Error downloading ${t.track.name}`)
              if (repeat_) items.push(t)
              else {
                console.log(`Failed to download ${t.track.name}`)
              }   
            })(t)
          )
      )
    ).then(() => wait(500))
  }*/

  await browser.close()
  return 0
})()
