import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  Button,
  ScrollArea,
  Badge,
  FileButton,
  Progress,
} from '@mantine/core';
import { IconPackage, IconX, IconUpload, IconTrash, IconEye } from '@tabler/icons-react';

interface Asset {
  id: string;
  name: string;
  type: string;
  status: 'ready' | 'processing' | 'error';
  sizeMb: number;
}

export function AssetsPanel({ onClose }: { onClose: () => void }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [uploading, setUploading] = useState(false);

  const handleUpload = (file: File | null) => {
    if (!file) return;
    setUploading(true);
    const asset: Asset = {
      id: crypto.randomUUID(),
      name: file.name,
      type: file.name.split('.').pop() || 'unknown',
      status: 'processing',
      sizeMb: Math.round(file.size / 1024 / 1024 * 10) / 10,
    };
    setAssets((prev) => [...prev, asset]);
    setTimeout(() => {
      setAssets((prev) =>
        prev.map((a) => (a.id === asset.id ? { ...a, status: 'ready' } : a)),
      );
      setUploading(false);
    }, 2000);
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
          <IconPackage size={16} color="#a78bfa" />
          <Text size="sm" fw={600} c="white">
            Assets
          </Text>
          <Badge size="xs" variant="light" color="violet">{assets.length}</Badge>
        </Group>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Group>

      <FileButton
        onChange={handleUpload}
        accept=".las,.laz,.e57,.ply,.tif,.tiff,.hgt,.gltf,.glb,.obj,.fbx,.ifc,.geojson,.shp,.kml,.gpkg"
      >
        {(props) => (
          <Button
            size="xs"
            variant="subtle"
            color="violet"
            leftSection={<IconUpload size={14} />}
            mb="xs"
            fullWidth
            loading={uploading}
            {...props}
          >
            Upload & Tile
          </Button>
        )}
      </FileButton>

      <ScrollArea flex={1}>
        <Stack gap={4}>
          {assets.length === 0 ? (
            <Text size="xs" c="dimmed" ta="center" py="xl">
              No assets. Upload a file to get started.
            </Text>
          ) : (
            assets.map((asset) => (
              <Group key={asset.id} justify="space-between" p="xs"
                style={{ background: '#21262d', borderRadius: 4 }}
              >
                <div>
                  <Text size="xs" c="white" fw={500} lineClamp={1}>
                    {asset.name}
                  </Text>
                  <Group gap={4}>
                    <Badge size="xs" variant="light">{asset.type}</Badge>
                    <Badge size="xs" variant="light"
                      color={asset.status === 'ready' ? 'green' : asset.status === 'error' ? 'red' : 'yellow'}
                    >
                      {asset.status}
                    </Badge>
                    <Text size="xs" c="dimmed">{asset.sizeMb}MB</Text>
                  </Group>
                </div>
                <Group gap={4}>
                  <ActionIcon size="xs" variant="subtle" color="violet">
                    <IconEye size={12} />
                  </ActionIcon>
                  <ActionIcon
                    size="xs"
                    variant="subtle"
                    color="red"
                    onClick={() => setAssets((p) => p.filter((a) => a.id !== asset.id))}
                  >
                    <IconTrash size={12} />
                  </ActionIcon>
                </Group>
              </Group>
            ))
          )}
        </Stack>
      </ScrollArea>
    </Paper>
  );
}
