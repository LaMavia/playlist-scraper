import * as Spotify from './spotify'
import { uuid } from './util'

export async function scrapePlaylist(id: string) {
  const { access_token, token_type } = await Spotify.getAccessToken()
  const res = await Spotify.reqPlaylist(id, token_type, access_token).catch(
    r => {
      console.error(`[spotify]> Getting playlist ${id} failed; ${new Error(r)}`)
      return Spotify.makeEmptyRes()
    }
  )

  return res
}
