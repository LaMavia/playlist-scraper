import axios from 'axios'
import fs from 'fs-extra'
import { resolve } from 'path'

export interface TokenRes {
  access_token: string
  token_type: string
  expires_in: number
}

const encodeBase64 = (s: string) => Buffer.from(s).toString('base64')

export const getID = (s: string): string => {
  if (/^https?:\/\/.+/.test(s)) {
    const matches = s.match(/playlist\/(\w+)\??/)

    if (!matches) throw new Error(`Invalid playlist url ${s}`)
    return matches[1]
  } else return s
}

export const getAccessToken = (): Promise<TokenRes> => {
  const encoded = `Basic ${encodeBase64(
    `${process.env['__CLIENT_ID__']}:${process.env['__CLIENT_SECRET__']}`
  )}`

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Authorization: encoded,
  }

  return axios
    .request({
      url: `https://accounts.spotify.com/api/token?grant_type=client_credentials`,
      method: 'POST',
      headers,
    })
    .then(r => {
      return r.data
    })
    .catch(err => {
      console.error(err)
      return err
    })
}

export interface Track extends Object {
  __id: string
  name: string
  duration_ms: number
  album: {
    artists: [
      {
        external_urls: {
          spotify: string
          [k: string]: string
        }
        href: string
        id: string
        name: string
        type: 'artist'
        uri: string
      }
    ]
    images: [
      {
        height: number
        url: string
        width: string
      }
    ]
  }
}

export interface PlaylistResponse {
  items: {
    track: Track
  }[]
}

export const makePlaylistURI = (id: string) =>
  `https://api.spotify.com/v1/playlists/${id}/tracks?market=ES&fields=items.track(album(images%2C%20artists(name%2C%20href))%2C%20name%2C%20duration_ms)`

export const makeEmptyRes = (): PlaylistResponse => ({
  items: [],
})

export const reqPlaylist = (
  id: string,
  token_type: string,
  token: string
): Promise<PlaylistResponse> => {
  return axios
    .request({
      url: makePlaylistURI(id),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    })
    .then(r => r.data)
    .catch(err => {
      console.error(err)
      return err
    })
}
