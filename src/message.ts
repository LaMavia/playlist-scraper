import * as YT from './youtube'
import * as Spotify from './spotify'

export enum MessageType {
  Status,
  Result,
  End,
  Order,
  Start,
  Error
}

interface _Message {
  type: MessageType
}

export enum MessageError {
  
}

export interface StatusMessage extends _Message {
  type: MessageType.Status
  progress: string
  track: YT.Track | Spotify.Track | null
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
  track: YT.Track | Spotify.Track | null
}

export interface EndMessage extends _Message {
  type: MessageType.End
}

export interface StartMessage extends _Message {
  type: MessageType.Start
}

export interface ErrorMessage extends _Message {
  type: MessageType.Error,
  error: Error,
  track: YT.Track | null
}

export type Message = StatusMessage | ResultMessage | OrderMessage | EndMessage | StartMessage | ErrorMessage
