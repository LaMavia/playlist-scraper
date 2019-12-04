import * as Spotify from './spotify'
import pptr from 'puppeteer'

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
}

export const scrapeSearch = async (
  track: Spotify.Track | Track,
  browser: pptr.Browser
): Promise<Track> => {
  // -------- Checking whether the track's already been scraped  -------- //
  if ((track as Track).url) return track as Track

  const page = await browser.newPage()
  page.setExtraHTTPHeaders({
    // 'Accept-Language': 'en',
  })
  await page.goto(makeSearchURI(track))

  await page.waitForSelector(
    'span.style-scope.ytd-thumbnail-overlay-time-status-renderer'
  )

  const res = await page.evaluate(
    (duration_ms: number, title: string, author: string): Track => {
      const RESULT_SEL = '#contents > ytd-video-renderer'
      const TITLE_SEL = '#video-title'
      const DURATION_SEL =
        '#overlays > ytd-thumbnail-overlay-time-status-renderer > span'

      const score = (target_track: Track, track: TrackInner) => {
        // -------- Utility functions -------- //
        const normalize = (x: string, i: number) =>
          x.toLowerCase().replace(/\W/gi, '')

        const count = (vec: number[], x: string) => {
          const j = words.indexOf(x)
          j !== -1 && vec[j]++
          return vec
        }

        const make_words = (t: TrackInner | Track): string[] => {
          const from_title = t.name ? t.name.split(/\s+/) : []
          const from_author = t.album
            ? t.album.artists.reduce(
                (acc, a) =>
                  acc.concat(
                    a.name === 'Various Artists'
                      ? []
                      : a.name.split(/\s+/).map(normalize)
                  ),
                [] as string[]
              ) // [0].name.split(/\s+/)
            : []

          return [...from_title, ...from_author]
        }

        // -------- Algoryth -------- //

        const words_right = make_words(target_track)
        const words_track = make_words(track)

        // -------- Vector of all the words -------- //
        const words: string[] = Array.from(
          new Set([...words_right, ...words_track].map(normalize))
        )

        // -------- Vectors of the words in the titles -------- //
        const w1 = words_right.reduce(count, new Array(words.length).fill(0))

        const w2 = words_track.reduce(count, new Array(words.length).fill(0))

        // -------- Make vectors accounting for meta data -------- //
        const v1 = w1
        const v2 = w2

        // -------- Calc the cos -------- //
        const dot_product = v1.reduce((acc, a, i) => (acc += a * v2[i]), 0)

        const denominator = Math.sqrt(
          v1.reduce((acc, x) => (acc += x ** 2)) *
            v2.reduce((acc, x) => (acc += x ** 2))
        )

        const d_duration = Math.abs((track.duration_ms || 0) - duration_ms) || 1 // Prevent infinite results

        return dot_product / denominator / d_duration
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

      const score_word_match = (t: TrackInner) => t.matches / 1000

      const score_of_track = (t: TrackInner) =>
        score({ name: title, duration_ms, author } as any, t) /
        ((t.name || '').split(/\s+/gi).length + 1)

      /**
       * (t: TrackInner): number =>
        t.matches /
        (t.duration_ms && duration_ms <= t.duration_ms
          ? duration_ms - (t.duration_ms || 0)
          : 10 ** 15)
       */

      const match = Array.from(document.querySelectorAll(RESULT_SEL))
        .map(r => {
          const name_el = r.querySelector(TITLE_SEL),
            name = name_el ? ((name_el as any).innerText || '').trim() : '-'

          const duration_el = r.querySelector(DURATION_SEL),
            duration_ms = duration_el
              ? parseTime((duration_el.textContent || '').trim()) * 1000
              : 0

          const url = name_el ? (name_el as any).href || '' : '-'

          const matches = title_regexes.reduce((acc, r) => {
            if (r.test(name)) acc++
            return acc
          }, 0)

          const t: TrackInner = {
            name,
            url,
            duration_ms,
            matches,
            score: 0,
          }

          t.score = score_of_track(t)
          return t
        })
        .reduce((matched_res, track) =>
          !matched_res || track.score < matched_res.score ? track : matched_res
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
  console.log(`\n${track.album.artists[0].name} - ${track.name} => ${res.name}`)
  res.name = `${track.name} ~ ${track.album.artists
    .map(a => a.name)
    .join(', ')}`
  return res
}
