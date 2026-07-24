import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    })
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-[60vh] flex items-center justify-center p-4">
          <div className="max-w-md w-full glass rounded-2xl border border-border p-8 space-y-6">
            <div className="flex items-center justify-center">
              <div className="p-4 bg-app-red/20 rounded-full">
                <AlertTriangle className="w-12 h-12 text-app-red" />
              </div>
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold text-foreground">Something went wrong</h2>
              <p className="text-muted-foreground">
                An unexpected error occurred. Don't worry, your data is safe.
              </p>
            </div>
            {this.state.error && import.meta.env.DEV && (
              <div className="bg-[var(--overlay-2)] rounded-lg p-4 border border-app-red/20">
                <p className="text-sm text-app-red font-mono break-words">
                  {this.state.error.message}
                </p>
              </div>
            )}
            <div className="flex gap-3">
              <Button
                type="button"
                size="lg"
                onClick={this.handleReset}
                className="flex-1 py-3"
              >
                <RefreshCw className="size-4" aria-hidden="true" />
                Try Again
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={() => globalThis.location.reload()}
                className="flex-1 py-3"
              >
                Reload Page
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
