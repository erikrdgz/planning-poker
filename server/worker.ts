import { DurableObject } from 'cloudflare:workers'
import { act, view, type Room, type Player } from '../src/protocol'
interface Env {
  ROOMS: DurableObjectNamespace<PokerRoom>
  ASSETS: Fetcher
}
interface Attachment {
  token: string
  player: Player
  host: string
  round: number
  revealed: boolean
  consensus: Room['consensus']
  last: number
}
export class PokerRoom extends DurableObject<Env> {
  room: Room = {
    players: [],
    host: '',
    round: 1,
    revealed: false,
    consensus: null,
  }
  sockets = new Map<WebSocket, Attachment>()
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    for (const ws of ctx.getWebSockets()) {
      const data = ws.deserializeAttachment() as Attachment
      this.sockets.set(ws, data)
      this.room.players.push(data.player)
      Object.assign(this.room, {
        host: data.host,
        round: data.round,
        revealed: data.revealed,
        consensus: data.consensus,
      })
    }
  }
  async fetch(request: Request) {
    const url = new URL(request.url)
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
      return new Response('WebSocket required', { status: 426 })
    const token = url.searchParams.get('token') ?? ''
    if (!/^[0-9a-f-]{36}$/.test(token))
      return new Response('Invalid participant', { status: 400 })
    if (!this.room.players.length && url.searchParams.get('create') !== '1')
      return new Response('This room has ended. Create a new room.', {
        status: 404,
      })
    const existing = [...this.sockets.values()].find(
      (data) => data.token === token,
    )?.player
    if (!existing && this.room.players.length >= 25)
      return new Response('This room is full (25 people).', { status: 409 })
    if (existing)
      for (const [ws, data] of this.sockets)
        if (data.token === token) {
          this.sockets.delete(ws)
          ws.close(1000, 'Joined from another tab')
        }
    const player = existing ?? {
      id: crypto.randomUUID(),
      avatar: Math.floor(Math.random() * 12),
      seat: Math.max(0, ...this.room.players.map((p) => p.seat)) + 1,
      vote: null,
    }
    if (!existing) this.room.players.push(player)
    if (!this.room.host) this.room.host = player.id
    const [client, server] = Object.values(new WebSocketPair())
    this.ctx.acceptWebSocket(server)
    this.sockets.set(server, {
      token,
      player,
      host: this.room.host,
      round: this.room.round,
      revealed: this.room.revealed,
      consensus: this.room.consensus,
      last: 0,
    })
    this.broadcast()
    return new Response(null, { status: 101, webSocket: client })
  }
  webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const data = this.sockets.get(ws)
    if (!data || typeof raw !== 'string' || raw.length > 256) return
    const now = Date.now()
    if (now - data.last < 60) return
    data.last = now
    try {
      const message = JSON.parse(raw)
      if (
        message &&
        typeof message === 'object' &&
        act(this.room, data.player.id, message)
      )
        this.broadcast()
    } catch {
      ws.send(
        JSON.stringify({
          type: 'error',
          message: 'That action could not be read.',
        }),
      )
    }
  }
  webSocketClose(ws: WebSocket) {
    this.remove(ws)
  }
  webSocketError(ws: WebSocket) {
    this.remove(ws)
  }
  remove(ws: WebSocket) {
    const data = this.sockets.get(ws)
    if (!data) return
    this.sockets.delete(ws)
    this.room.players = this.room.players.filter((p) => p.id !== data.player.id)
    if (this.room.host === data.player.id)
      this.room.host = this.room.players[0]?.id ?? ''
    if (!this.room.players.length)
      this.room = {
        players: [],
        host: '',
        round: 1,
        revealed: false,
        consensus: null,
      }
    this.broadcast()
  }
  broadcast() {
    for (const [ws, data] of this.sockets) {
      Object.assign(data, {
        host: this.room.host,
        round: this.room.round,
        revealed: this.room.revealed,
        consensus: this.room.consensus,
      })
      ws.serializeAttachment(data)
      try {
        ws.send(JSON.stringify(view(this.room, data.player.id)))
      } catch {
        /* Close/error handler removes disconnected participants. */
      }
    }
  }
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) {
      const origin = request.headers.get('Origin')
      if (origin && origin !== url.origin)
        return new Response('Origin rejected', { status: 403 })
      const match = url.pathname.match(/^\/api\/rooms\/([a-f0-9-]{36})$/)
      if (!match) return new Response('Not found', { status: 404 })
      return env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch(request)
    }
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
