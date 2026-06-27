import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { AppLayout } from './AppLayout'

afterEach(cleanup)

describe('AppLayout', () => {
  it('renders children in the main content area', () => {
    render(
      <AppLayout>
        <p>Screen content</p>
      </AppLayout>,
    )
    const main = screen.getByRole('main')
    expect(main).toBeInTheDocument()
    expect(main).toHaveTextContent('Screen content')
  })

  it('renders the sidebar region when provided', () => {
    render(
      <AppLayout sidebar={<span>Side nav</span>}>
        <p>Content</p>
      </AppLayout>,
    )
    const sidebar = screen.getByRole('complementary', { name: 'Primary' })
    expect(sidebar).toHaveTextContent('Side nav')
  })

  it('omits the sidebar region when not provided', () => {
    render(
      <AppLayout>
        <p>Content</p>
      </AppLayout>,
    )
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })

  it('renders the bottom nav and header slots when provided', () => {
    render(
      <AppLayout header={<span>Top bar</span>} bottomNav={<span>Bottom bar</span>}>
        <p>Content</p>
      </AppLayout>,
    )
    expect(screen.getByText('Top bar')).toBeInTheDocument()
    expect(screen.getByText('Bottom bar')).toBeInTheDocument()
  })

  it('applies a custom className', () => {
    const { container } = render(
      <AppLayout className="trip-layout">
        <p>Content</p>
      </AppLayout>,
    )
    expect(container.querySelector('.app-layout')).toHaveClass('trip-layout')
  })
})
