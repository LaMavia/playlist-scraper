import * as YT from './youtube'
import * as Spotify from './spotify'

export enum MessageType {
  Status,
  Result,
  End,
  Order,
  Start
}

interface _Message {
  type: MessageType
}

export interface StatusMessage extends _Message {
  type: MessageType.Status
  progress: string
  track: YT.Track | Spotify.Track
  ok: boolean
  err: string | null
}

export interface ResultMessage extends _Message {
  type: MessageType.Result
  track: YT.Track
  finish: boolean
  ok: boolean
}

export interface OrderMessage extends _Message {
  type: MessageType.Order
  track: YT.Track | Spotify.Track
}

export interface EndMessage extends _Message {
  type: MessageType.End
}

export interface StartMessage extends _Message {
  type: MessageType.Start
}

export type Message = StatusMessage | ResultMessage | OrderMessage | EndMessage | StartMessage
