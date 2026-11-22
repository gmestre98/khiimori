import { describe, expect, it } from 'vitest'
import { categoryOfItem, emptyFields } from './planItemForm.helpers'

describe('categoryOfItem', () => {
  it('uses the item category when it has one', () => {
    expect(categoryOfItem({ type: 'Other', kind: 'activity' })).toBe('Other')
    expect(categoryOfItem({ type: 'Food', kind: 'activity' })).toBe('Food')
  })

  it('falls back to the category of its kind', () => {
    expect(categoryOfItem({ type: undefined, kind: 'activity' })).toBe('Activities')
    expect(categoryOfItem({ type: '', kind: 'food' })).toBe('Food')
    expect(categoryOfItem({ type: ' ', kind: 'transport' })).toBe('Transport')
    expect(categoryOfItem({ type: undefined, kind: undefined })).toBe('Activities')
  })
})

describe('emptyFields', () => {
  it('starts a new activity in Activities, not in no category', () => {
    expect(emptyFields()).toMatchObject({ kind: 'activity', type: 'Activities' })
  })
})
