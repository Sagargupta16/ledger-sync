import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasChunkError: boolean
}

/**
 * Catches errors from failed lazy chunk loads (e.g. network failures)
 * and shows a retry UI instead of a blank page.
 */
export class ChunkErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasChunkError: false }
  }

  static getDerivedStateFromError(error: Error): State | null {
    const msg = error.message || ''
    const isChunkError =
      msg.includes('Loading chunk') ||
      msg.includes('dynamically imported module') ||
      msg.includes('Failed to fetch') ||
      msg.includes('Loading CSS chunk')
    return isChunkError ? { hasChunkError: true } : null
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ChunkErrorBoundary] Chunk load failed:', error.message, errorInfo.componentStack)
  }

  render() {
    if (this.state.hasChunkError) {
      return (
        <div className="min-h-[50vh] flex items-center justify-center p-4">
          <div className="text-center space-y-4">
            <h2 className="text-xl font-semibold text-white">Failed to load page</h2>
            <p className="text-sm text-muted-foreground">
              A network error prevented the page from loading.
            </p>
            <button
              onClick={() => globalThis.location.reload()}
              className="inline-block px-6 py-3 bg-gradient-to-r from-primary to-secondary text-white rounded-lg hover:shadow-lg transition-colors"
            >
              Reload
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
