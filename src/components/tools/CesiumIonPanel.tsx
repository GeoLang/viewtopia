import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  TextInput,
  Button,
  Badge,
  ScrollArea,
} from '@mantine/core';
import { IconSatellite, IconX, IconSearch } from '@tabler/icons-react';

interface IonAsset {
  id: number;
  name: string;
  type: string;
}

export function CesiumIonPanel({ onClose }: { onClose: () => void }) {
  const [token, setToken] = useState('');
  const [connected, setConnected] = useState(false);
  const [assets] = useState<IonAsset[]>([]);

  const handleConnect = () => {
    if (token.trim()) {
      setConnected(true);
    }
  };

  return (
    <Paper
      shadow="xl"
      radius="md"
      p="sm"
      style={{
        position: 'absolute',
        top: 60,
        right: 16,
        width: 300,
        maxHeight: '60vh',
        background: '#161b22',
        border: '1px solid #30363d',
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <IconSatellite size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Cesium Ion
          </Text>
          {connected && <Badge size="xs" color="green">Connected</Badge>}
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        {!connected ? (
          <>
            <TextInput
              size="xs"
              label="Access Token"
              placeholder="Paste your Cesium Ion token…"
              value={token}
              onChange={(e) => setToken(e.currentTarget.value)}
              type="password"
              styles={{ input: { background: '#0d1117', borderColor: '#30363d' } }}
            />
            <Button size="xs" variant="filled" color="violet" onClick={handleConnect} fullWidth>
              Connect
            </Button>
          </>
        ) : (
          <ScrollArea flex={1}>
            {assets.length > 0 ? (
              assets.map((asset) => (
                <Group key={asset.id} justify="space-between" p="xs"
                  style={{ background: '#21262d', borderRadius: 4, marginBottom: 4 }}
                >
                  <Text size="xs" c="white">{asset.name}</Text>
                  <Badge size="xs" variant="light">{asset.type}</Badge>
                </Group>
              ))
            ) : (
              <Text size="xs" c="dimmed" ta="center" py="md">
                No assets found. Upload data to Cesium Ion to see it here.
              </Text>
            )}
          </ScrollArea>
        )}
      </Stack>
    </Paper>
  );
}
