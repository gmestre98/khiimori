import { describe, expect, it } from 'vitest'
import { activeKeys, chipText, conflictNote, toggle, type StatusState } from './statusModel'

const all = { booking: true, happened: true, spontaneous: true }
const base: StatusState = { booking: 'none', happened: 'planned', spontaneous: false }

describe('status list', () => {
  it('lets compatible statuses combine', () => {
    let s = toggle(base, 'paid')
    s = toggle(s, 'done')
    s = toggle(s, 'spontaneous')
    expect(activeKeys(s, all)).toEqual(['paid', 'done', 'spontaneous'])
    expect(chipText(s, all)).toBe('Paid · Done · Spontaneous')
    // Paid but skipped is allowed (money already spent).
    expect(activeKeys(toggle(s, 'skipped'), all)).toEqual(['paid', 'skipped', 'spontaneous'])
  })

  it('replaces a conflicting status and says so', () => {
    const paid = toggle(base, 'paid')
    const booked = toggle(paid, 'booked')
    expect(activeKeys(booked, all)).toEqual(['booked'])
    expect(conflictNote(paid, booked, 'booked')).toBe('Booked replaced Paid.')

    const done = toggle(base, 'done')
    const skipped = toggle(done, 'skipped')
    expect(activeKeys(skipped, all)).toEqual(['skipped'])

    // To book and Done exclude each other, both ways.
    const toBook = toggle(base, 'to_book')
    expect(activeKeys(toggle(toBook, 'done'), all)).toEqual(['done'])
    expect(activeKeys(toggle(done, 'to_book'), all)).toEqual(['to_book'])
  })

  it('turns a status off when tapped again', () => {
    const s = toggle(toggle(base, 'booked'), 'booked')
    expect(s.booking).toBe('none')
    expect(toggle(toggle(base, 'skipped'), 'skipped').happened).toBe('planned')
    expect(chipText(base, all)).toBe('Status')
  })

  it('shows only what applies: stays have just a booking; packaged items read Included', () => {
    const stay = { booking: true, happened: false, spontaneous: false }
    expect(chipText({ ...base, booking: 'paid', happened: 'done' }, stay)).toBe('Paid')
    const packaged = { booking: false, happened: true, spontaneous: true }
    expect(chipText({ ...base, booking: 'booked', happened: 'skipped' }, packaged, true)).toBe(
      'Included · Skipped',
    )
  })
})
