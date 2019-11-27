import * as Spotify from './spotify'
import pptr from 'puppeteer'

const makeSearchURI = (track: Spotify.Track): string =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(
    `${track.album ? track.album.artists[0].name : ''} ${track.name}`
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

      const score_of_track = (t: TrackInner): number =>
        t.matches / (duration_ms - (t.duration_ms || 0))

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
  res.name = `${track.name} ~ ${track.album.artists[0].name}`
  return res
}
