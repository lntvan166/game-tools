import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('App error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 24, textAlign: 'center', color: '#fff', fontFamily: 'sans-serif',
          background: '#222', minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <h2 style={{ color: '#d3a446', marginBottom: 16 }}>Something went wrong</h2>
          <p style={{ color: '#aaa', marginBottom: 16 }}>Please refresh the page or try again.</p>
          {import.meta.env.DEV && this.state.error && (
            <pre style={{ fontSize: 12, color: '#888', maxWidth: 400, overflow: 'auto' }}>
              {this.state.error.message}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
