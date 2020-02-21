import pptr from 'puppeteer'
import * as YT from './youtube'
import * as Spotify from './spotify'
import * as Download from './download'
import { send } from './util'
import { Message, MessageType, MessageError } from './message'
import { num } from './env'

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
    const handleException = (rej: (err: Error) => any, track: YT.Track) => (
      error: Error
    ) => {
      send({
        type: MessageType.Error,
        error,
        track,
      })
      rej(error)
    }

    process.on('beforeExit', () => {
      browser.process().kill('SIGKILL')
    })
    process.on('message', async (msg: Message) => {
      try {
        switch (msg.type) {
          case MessageType.End:
            {
              await browser
                .close()
                .then(() => {
                  send({
                    type: MessageType.End,
                  })
                })
                .then(res)
            }
            break
          case MessageType.Order:
            {
              if (!msg.track) {
                send({
                  type: MessageType.End,
                })
                return res()
              }
              const ytTrack = await YT.scrapeSearch(msg.track, browser)
              const exceptionHandler = handleException(rej, (ytTrack ||
                msg.track) as any)
              const rejectionHandler = handleException(rej, (ytTrack ||
                msg.track) as any)
              process
                .once('uncaughtException', exceptionHandler)
                .once('unhandledRejection', r => rejectionHandler(r as any))
              if (!ytTrack) {
                send({
                  type: MessageType.Result,
                  ok: false,
                  finish: false,
                  track: {
                    ...msg.track,
                    url: '',
                  },
                })
                return
              } else {
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

              process.removeListener('uncaughtException', exceptionHandler)
              process.removeListener('unhandledRejection', rejectionHandler)
            }
            break
        }

        if (browser.isConnected())
          for (const page of (await browser.pages().catch(() => [])).slice(1) ||
            []) {
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
  await makeScraper().then(() => {
    process.exit(0)
  })
})()
