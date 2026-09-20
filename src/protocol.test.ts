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
