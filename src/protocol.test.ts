import { describe, it, expect } from 'vitest'
import { act, view, type Room } from './protocol'
function fixture(): Room {
  return {
    players: [
      { id: 'host', avatar: 0, seat: 1, vote: null },
      { id: 'guest', avatar: 1, seat: 2, vote: null },
    ],
    host: 'host',
    round: 1,
    revealed: false,
    consensus: null,
    discussion: null,
    celebrationAt: 0,
  }
}
describe('private voting and host authority', () => {
  it('never sends other hidden card values, including to the host', () => {
    const r = fixture()
    act(r, 'guest', { type: 'vote', card: '13' })
    expect(view(r, 'host').players[1]).not.toHaveProperty('vote')
    expect(view(r, 'host').players[1].voted).toBe(true)
    expect(view(r, 'guest').players[1].vote).toBe('13')
  })
  it('rejects guest reveal and reset without changing votes', () => {
    const r = fixture()
    act(r, 'guest', { type: 'vote', card: '5' })
    expect(act(r, 'guest', { type: 'reveal' })).toBe(false)
    expect(act(r, 'guest', { type: 'reset' })).toBe(false)
    expect(r.players[1].vote).toBe('5')
    expect(r.revealed).toBe(false)
  })
  it('allows one changeable vote and freezes cards after reveal', () => {
    const r = fixture()
    act(r, 'guest', { type: 'vote', card: '3' })
    act(r, 'guest', { type: 'vote', card: '5' })
    act(r, 'host', { type: 'reveal' })
    expect(act(r, 'guest', { type: 'vote', card: '8' })).toBe(false)
    expect(view(r, 'host').players[1].vote).toBe('5')
  })
  it('celebrates only complete agreement from at least two players', () => {
    const r = fixture()
    act(r, 'host', { type: 'vote', card: 'coffee' })
    act(r, 'host', { type: 'reveal' })
    expect(r.consensus).toBe(null)
    act(r, 'host', { type: 'reset' })
    for (const p of r.players) act(r, p.id, { type: 'vote', card: 'coffee' })
    act(r, 'host', { type: 'reveal' })
    expect(r.consensus).toBe('coffee')
    act(r, 'host', { type: 'reset' })
    expect(r.consensus).toBe(null)
    expect(r.players.every((p) => p.vote === null)).toBe(true)
    expect(r.round).toBe(3)
  })
  it('does not celebrate disagreement or a solo vote', () => {
    const r = fixture()
    act(r, 'host', { type: 'vote', card: '3' })
    act(r, 'guest', { type: 'vote', card: '5' })
    act(r, 'host', { type: 'reveal' })
    expect(r.consensus).toBe(null)
    r.players.pop()
    act(r, 'host', { type: 'reset' })
    act(r, 'host', { type: 'vote', card: '3' })
    act(r, 'host', { type: 'reveal' })
    expect(r.consensus).toBe(null)
  })
  it('rejects invalid cards, unknown participants, and invalid avatars', () => {
    const r = fixture()
    for (const card of ['21', 3, null, '<script>'])
      expect(act(r, 'guest', { type: 'vote', card })).toBe(false)
    expect(act(r, 'unknown', { type: 'vote', card: '3' })).toBe(false)
    expect(act(r, 'guest', { type: 'avatar', avatar: 99 })).toBe(false)
  })
})

describe('coffee discussion timer', () => {
  it('offers only after revealing coffee and lets the host decline', () => {
    const r = fixture()
    act(r, 'guest', { type: 'vote', card: 'coffee' })
    expect(view(r, 'host').discussion).toBe(null)
    expect(act(r, 'host', { type: 'timer-start', seconds: 180 })).toBe(false)
    act(r, 'host', { type: 'reveal' })
    expect(r.discussion?.status).toBe('offered')
    expect(act(r, 'guest', { type: 'timer-dismiss' })).toBe(false)
    act(r, 'host', { type: 'timer-dismiss' })
    expect(r.discussion?.status).toBe('dismissed')
  })
  it('shares a fixed deadline, rejects guest starts, and clears on reset', () => {
    const r = fixture()
    act(r, 'guest', { type: 'vote', card: 'coffee' })
    act(r, 'host', { type: 'reveal' })
    expect(act(r, 'guest', { type: 'timer-start', seconds: 180 })).toBe(false)
    expect(act(r, 'host', { type: 'timer-start', seconds: 10 })).toBe(false)
    act(r, 'host', { type: 'timer-start', seconds: 180 }, 1000)
    expect(view(r, 'guest').discussion?.endsAt).toBe(181000)
    expect(act(r, 'host', { type: 'timer-start', seconds: 300 })).toBe(false)
    act(r, 'host', { type: 'reset' })
    expect(r.discussion).toBe(null)
  })
})

it('accepts slider boundaries and rejects invalid timer durations', () => {
  for (const seconds of [30, 180, 330, 600]) {
    const r = fixture()
    act(r, 'guest', { type: 'vote', card: 'coffee' })
    act(r, 'host', { type: 'reveal' })
    expect(act(r, 'host', { type: 'timer-start', seconds }, 1000)).toBe(true)
    expect(r.discussion?.endsAt).toBe(1000 + seconds * 1000)
  }
  for (const seconds of [0, 29, 31, 601, NaN, '180', null]) {
    const r = fixture()
    act(r, 'guest', { type: 'vote', card: 'coffee' })
    act(r, 'host', { type: 'reveal' })
    expect(act(r, 'host', { type: 'timer-start', seconds })).toBe(false)
  }
})

it('only lets the host celebrate and enforces a two-second cooldown', () => {
  const r = fixture()
  expect(act(r, 'guest', { type: 'celebrate' }, 5000)).toBe(false)
  expect(act(r, 'host', { type: 'celebrate' }, 5000)).toBe(true)
  expect(view(r, 'guest').celebrationAt).toBe(5000)
  expect(act(r, 'host', { type: 'celebrate' }, 6000)).toBe(false)
  expect(act(r, 'host', { type: 'celebrate' }, 7000)).toBe(true)
})
