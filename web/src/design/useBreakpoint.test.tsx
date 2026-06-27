import { afterEach, describe, it, expect } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { useBreakpoint, useIsLaptop } from './useBreakpoint'

afterEach(cleanup)

function setWidth(width: number) {
  act(() => {
    ;(window as { innerWidth: number }).innerWidth = width
    window.dispatchEvent(new Event('resize'))
  })
}

function Probe() {
  return <span data-testid="bp">{useBreakpoint()}</span>
}

function LaptopProbe() {
  return <span data-testid="laptop">{String(useIsLaptop())}</span>
}

describe('useBreakpoint', () => {
  it('reports the breakpoint for the current width and updates on resize', () => {
    setWidth(1280)
    render(<Probe />)
    expect(screen.getByTestId('bp')).toHaveTextContent('laptop')

    setWidth(375)
    expect(screen.getByTestId('bp')).toHaveTextContent('mobile')

    setWidth(800)
    expect(screen.getByTestId('bp')).toHaveTextContent('tablet')
  })

  it('useIsLaptop tracks the laptop breakpoint', () => {
    setWidth(1280)
    render(<LaptopProbe />)
    expect(screen.getByTestId('laptop')).toHaveTextContent('true')

    setWidth(700)
    expect(screen.getByTestId('laptop')).toHaveTextContent('false')
  })
})
