import { Button, Group, Paper, Stack, Text } from '@mantine/core';
import { leaveBimMode } from './bimMode';
import { useBimModeStore, type BimNavigation } from './store';

function navigationHint(navigation: BimNavigation, floorHeight: number | null): string {
  if (navigation === 'orbit') {
    return 'Double-click the model to orbit around that point. Drag to orbit, scroll to zoom.';
  }
  if (floorHeight === null) return 'Click a floor to stand on it. Drag to look.';
  return 'W A S D or the arrow keys walk. Walls stop you, and steps up to 30 cm carry you up. Drag to look. Click a floor to stand there.';
}

export function BimModeBadge() {
  const session = useBimModeStore((state) => state.session);
  const navigation = useBimModeStore((state) => state.navigation);
  const floorHeight = useBimModeStore((state) => state.floorHeight);
  const notice = useBimModeStore((state) => state.notice);
  if (!session) return null;
  return (
    <Paper
      data-testid="bim-mode-badge"
      p="xs"
      shadow="sm"
      style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 5, maxWidth: 420 }}
    >
      <Group gap="xs" wrap="nowrap" align="flex-start">
        <Stack gap={2}>
          <Text size="xs" fw={600}>
            BIM mode: {session.model.name}
          </Text>
          <Text size="xs" c="dimmed" data-testid="bim-navigation-hint">
            {navigationHint(navigation, floorHeight)}
          </Text>
          {notice && (
            <Text size="xs" c="yellow" data-testid="bim-notice">
              {notice}
            </Text>
          )}
        </Stack>
        <Button size="compact-xs" variant="light" color="violet" onClick={leaveBimMode}>
          Leave
        </Button>
      </Group>
    </Paper>
  );
}
