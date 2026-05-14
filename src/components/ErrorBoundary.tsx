import { Component, type ReactNode } from 'react';
import { Box, Text, Button, Stack } from '@mantine/core';

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <Box
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            background: '#0d1117',
            padding: 32,
          }}
        >
          <Stack align="center" gap="md">
            <Text c="red" fw={600} size="lg">
              {this.props.fallbackMessage ?? 'Something went wrong'}
            </Text>
            <Text c="dimmed" size="sm" maw={400} ta="center">
              {this.state.error?.message}
            </Text>
            <Button variant="outline" color="violet" onClick={this.handleReset}>
              Try Again
            </Button>
          </Stack>
        </Box>
      );
    }
    return this.props.children;
  }
}
