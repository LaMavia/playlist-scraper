import * as Spotify from './spotify'
import pptr from 'puppeteer'
import { send } from './util'
import { MessageType } from './message'

const makeSearchURI = (track: Spotify.Track): string =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(
    `"${
      track.album ? track.album.artists.map(a => a.name).join(' ') : ''
    }" ${track.name.toLowerCase()}`
  )}&sp=EgIQAQ%253D%253D`

export interface Track extends Spotify.Track {
  url: string
}

interface TrackInner extends Partial<Track> {
  matches: number
  score: number
  artist: string
}

export const scrapeSearch = async (
  track: Spotify.Track | Track,
  browser: pptr.Browser
): Promise<Track | null> => {
  send({
    type: MessageType.Status,
    err: null,
    ok: true,
    progress: `YT`,
    track,
  })
  // -------- Checking whether the track's already been scraped  -------- //
  if ((track as Track).url) return track as Track

  const page = await browser.newPage()
  page.setExtraHTTPHeaders({
    // 'Accept-Language': 'en',
  })
  await page.goto(makeSearchURI(track))

  const cont = await page
    .waitForSelector(
      'span.style-scope.ytd-thumbnail-overlay-time-status-renderer',
      {
        timeout: 5000,
      }
    )
    .then(() => true)
    .catch(err => {
      // console.log(err)
      return false
    })

  if (!cont) {
    send({
      type: MessageType.Status,
      err: 'no found',
      ok: false,
      progress: 'YT',
      track,
    })
    !page.isClosed() && (await page.close())
    return null
  }

  const res = await page.evaluate(
    (duration_ms: number, title: string, author: string): Track => {
      const RESULT_SEL = '#contents > ytd-video-renderer'
      const TITLE_SEL = '#video-title'
      const DURATION_SEL =
        '#overlays > ytd-thumbnail-overlay-time-status-renderer > span'

      const normalize = (x: string) => x.toLowerCase().replace(/\W/gi, '')

      const score = (target_track: Track, track: TrackInner) => {
        // -------- Utility functions -------- //

        const count = (vec: number[], x: string) => {
          const j = words.indexOf(normalize(x))
          j !== -1 && vec[j]++
          return vec
        }

        const make_words = (t: TrackInner | Track): string[] => {
          const from_title = t.name ? t.name.split(/\s+/) : []
          const from_author = t.album
            ? t.album.artists.reduce(
                (acc, a) =>
                  acc.concat(
                    a.name.split(/\s+/).filter(Boolean) // /(various)/i.test(a.name) ? [] :
                  ),
                [] as string[]
              ) // [0].name.split(/\s+/)
            : [] // (t.name || '').split(/\s+/)

          return [...from_title, ...from_author]
        }

        // -------- Algoryth -------- //

        const words_right = make_words(target_track)
        const words_track = make_words(track)

        // -------- Vector of all the words -------- //
        const words: string[] = Array.from(
          new Set(
            [...words_right, ...words_track].map(normalize).filter(Boolean)
          )
        )

        // -------- Vectors of the words in the titles -------- //
        const w1 = words_right.reduce(count, new Array(words.length).fill(0))

        const w2 = words_track.reduce(count, new Array(words.length).fill(0))

        // -------- Calc the cos -------- //
        const dot_product = w1.reduce((acc, a, i) => (acc += a * w2[i]), 0)

        const denominator = Math.sqrt(
          w1.reduce((acc, x) => (acc += x ** 2)) *
            w2.reduce((acc, x) => (acc += x ** 2))
        )

        const d_duration =
          Math.abs((track.duration_ms || 0) - duration_ms) || 0.01 // Prevent infinite results

        debugger
        console.log(d_duration)
        return dot_product / (denominator * d_duration ** 2)
      }

      const parseTime = (t: string) =>
        t
          .split(':')
          .reverse()
          .map((a, i) => (+a || 0) * 60 ** i)
          .reduce((acc, x) => (acc += x), 0)

      const title_regexes = `${title} ${author}`
        .trim()
        .split(' ')
        .filter(Boolean)
        .map(t => new RegExp(t.replace(/[\.\\\*\+\[\]\(\)]*/gi, ''), 'i'))

      const score_of_track = (t: TrackInner) =>
        score({ name: title, duration_ms, author } as any, t) /
        ((t.name || '').split(/\s+/gi).length + 1)

      const match = Array.from(document.querySelectorAll(RESULT_SEL))
        .map(r => {
          const name_el = r.querySelector(TITLE_SEL),
            name = name_el ? ((name_el as any).innerText || '').trim() : '-'

          const duration_el = r.querySelector(DURATION_SEL),
            duration_ms = duration_el
              ? parseTime((duration_el.textContent || '').trim()) * 1000
              : 0

          const url = name_el ? (name_el as any).href || '' : '-'

          const artist_el = r.querySelector(
              '.style-scope.ytd-channel-name.complex-string'
            ),
            artist = normalize(artist_el ? artist_el.textContent || '' : '')

          const matches = title_regexes.reduce((acc, r) => {
            if (r.test(name)) acc++
            return acc
          }, 0)

          const t: TrackInner = {
            name,
            artist,
            url,
            duration_ms,
            matches,
            score: 0,
          }

          t.score = score_of_track(t)
          console.log(t.score)
          return t
        })
        .reduce((matched_res, track) =>
          !matched_res || track.score > matched_res.score ? track : matched_res
        )

      delete match.matches
      delete match.score

      return (match as any) as Track
    },
    track.duration_ms,
    track.name,
    track.album.artists[0].name
  )

  await page.close()
  process.env['NODE_ENV'] === 'development' &&
    console.log(
      `\n${track.album.artists.map(a => a.name).join(', ')} - ${
        track.name
      } => ${res.name}`
    )
  return {
    ...res,
    __id: track.__id,
    name: `${track.name} ~ ${track.album.artists.map(a => a.name).join(', ')}`,
  }
}
