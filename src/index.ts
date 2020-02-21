import cl from 'cluster'
import * as Playlist from './playlist'
import * as Spotify from './spotify'
import { logTable, uuid, padString } from './util'
import fs from 'fs-extra'
import { resolve } from 'path'
import { load_env } from './env'
import { cpus } from 'os'
import { Message, MessageType } from './message'

const MAX_WORKERS = Math.min(3, cpus().length)
const forkWorker = () =>
  cl.fork({
    __OUTPUT__: process.argv[3],
  })

load_env()
const main = () =>
  new Promise(async (res, rej) => {
    const [url_or_id, out] = process.argv.slice(2)

    if (!url_or_id || !out)
      return console.log(`
      HOW TO USE: <url or playlist_id> <output_path>
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
        console.log(padString(v, (process.stdout.columns / 3) * 2))
      )
    }

    cl.on('exit', (w, c, sig) => {
      if (sig != 'SIGKILL' && c != 0) {
        w.process.kill()
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
            else if (m.track.url) tracks.unshift(m.track)
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
              processing.set(m.track.__id, `[${m.progress}] ${m.track.name}`)
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
        case MessageType.Error:
          {
            w.process.kill('SIGKILL')
            if (m.track) {
              processing.delete(m.track.__id)
              if (m.track.url) tracks.unshift(m.track)
            }

            const lenWorkers = Object.keys(cl.workers).length
            if (lenWorkers < MAX_WORKERS) {
              forkWorker()
            }
          }
          break
      }
    })

    cl.settings.exec = resolve(__dirname, 'worker')

    for (const _ in new Array(MAX_WORKERS).fill(0)) {
      forkWorker()
    }

    display()
  })
;(async () => {
  if (cl.isMaster) await main()
})()
