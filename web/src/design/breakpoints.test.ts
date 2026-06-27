import { describe, it, expect } from 'vitest'
import {
  BREAKPOINTS,
  breakpointForWidth,
  isLaptopWidth,
  LAPTOP_MIN_WIDTH,
  MEDIA_QUERIES,
} from './breakpoints'

describe('breakpoints', () => {
  it('resolves widths to the correct named breakpoint', () => {
    expect(breakpointForWidth(0)).toBe('mobile')
    expect(breakpointForWidth(375)).toBe('mobile')
    expect(breakpointForWidth(639)).toBe('mobile')
    expect(breakpointForWidth(640)).toBe('tablet')
    expect(breakpointForWidth(900)).toBe('tablet')
    expect(breakpointForWidth(1023)).toBe('tablet')
    expect(breakpointForWidth(1024)).toBe('laptop')
    expect(breakpointForWidth(1920)).toBe('laptop')
  })

  it('isLaptopWidth flips at the laptop minimum', () => {
    expect(isLaptopWidth(LAPTOP_MIN_WIDTH - 1)).toBe(false)
    expect(isLaptopWidth(LAPTOP_MIN_WIDTH)).toBe(true)
    expect(LAPTOP_MIN_WIDTH).toBe(BREAKPOINTS.laptop)
  })

  it('media queries reference the breakpoint pixel values', () => {
    expect(MEDIA_QUERIES.laptop).toBe('(min-width: 1024px)')
    expect(MEDIA_QUERIES.mobile).toBe('(max-width: 1023px)')
    expect(MEDIA_QUERIES.tablet).toBe('(min-width: 640px) and (max-width: 1023px)')
  })
})
