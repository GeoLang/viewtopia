import { useState } from 'react';
import {
  Paper,
  Text,
  Stack,
  Group,
  ActionIcon,
  NumberInput,
  Button,
  Badge,
  ScrollArea,
  Table,
  Slider,
  Divider,
} from '@mantine/core';
import {
  IconX,
  IconHome,
  IconCurrencyDollar,
  IconMapPin,
} from '@tabler/icons-react';
import { searchComps } from '../../lib/realEstate';

const METERS_PER_MILE = 1609.34;

interface CompSale {
  address: string;
  saleDate: string;
  salePrice: number;
  sqft: number;
  pricePerSqft: number;
  bedrooms: number;
  bathrooms: number;
  yearBuilt: number;
  distance: number; // miles from subject
  lat: number;
  lng: number;
}

interface CompsPanelProps {
  branchId: string | null;
  subjectLat: number | null;
  subjectLng: number | null;
  onFlyTo: (lat: number, lng: number, zoom?: number) => void;
  onHighlightComps: (comps: Array<{ lat: number; lng: number }>) => void;
  onClose: () => void;
}

export function CompsPanel({
  branchId,
  subjectLat,
  subjectLng,
  onFlyTo,
  onHighlightComps,
  onClose,
}: CompsPanelProps) {
  const [radius, setRadius] = useState(0.5); // miles
  const [months, setMonths] = useState(6);
  const [minSqft, setMinSqft] = useState<number | string>(0);
  const [maxSqft, setMaxSqft] = useState<number | string>(10000);
  const [comps, setComps] = useState<CompSale[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (subjectLat === null || subjectLng === null) {
      setError('Select a subject property first (use Parcel panel)');
      return;
    }
    if (!branchId) {
      setError('Sales dataset not loaded. Run scripts/seed-parcels.mjs.');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const num = (v: number | string, fallback: number): number => {
        const n = typeof v === 'number' ? v : parseFloat(v);
        return Number.isFinite(n) ? n : fallback;
      };
      const { comps: found } = await searchComps(branchId, {
        lng: subjectLng,
        lat: subjectLat,
        radiusM: radius * METERS_PER_MILE,
        maxDays: months * 30,
        minSqft: num(minSqft, 0),
        maxSqft: num(maxSqft, 99999),
      });
      const results: CompSale[] = found.map((c) => {
        const props = c.properties;
        const propNum = (key: string): number => {
          const v = props[key];
          return typeof v === 'number' ? v : 0;
        };
        return {
          address: c.address,
          saleDate: c.saleDate,
          salePrice: c.salePrice,
          sqft: c.sqft,
          pricePerSqft: c.pricePerSqft,
          bedrooms: propNum('bedrooms'),
          bathrooms: propNum('bathrooms'),
          yearBuilt: propNum('year_built'),
          distance: c.distanceM / METERS_PER_MILE,
          lat: propNum('lat'),
          lng: propNum('lng'),
        };
      });
      setComps(results);
      onHighlightComps(results.map((c) => ({ lat: c.lat, lng: c.lng })));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const avgPrice =
    comps.length > 0
      ? comps.reduce((s, c) => s + c.salePrice, 0) / comps.length
      : 0;
  const avgPpsf =
    comps.length > 0
      ? comps.reduce((s, c) => s + c.pricePerSqft, 0) / comps.length
      : 0;
  const unmapped = comps.filter((c) => c.lat === 0 && c.lng === 0).length;

  return (
    <Paper p="sm" radius="md" withBorder>
      <Stack gap="xs">
        <Group justify="space-between">
          <Group gap="xs">
            <IconHome size={18} />
            <Text fw={600} size="sm">
              Comparable Sales
            </Text>
          </Group>
          <ActionIcon size="sm" variant="subtle" onClick={onClose}>
            <IconX size={14} />
          </ActionIcon>
        </Group>

        <Text size="xs" c="dimmed">
          Search radius (miles)
        </Text>
        <Slider
          size="xs"
          min={0.1}
          max={3.0}
          step={0.1}
          value={radius}
          onChange={setRadius}
          marks={[
            { value: 0.5, label: '0.5' },
            { value: 1.0, label: '1' },
            { value: 2.0, label: '2' },
          ]}
        />

        <Group gap="xs" grow>
          <NumberInput
            size="xs"
            label="Months back"
            value={months}
            onChange={(v) => setMonths(Number(v) || 6)}
            min={1}
            max={24}
          />
          <NumberInput
            size="xs"
            label="Min sqft"
            value={minSqft}
            onChange={setMinSqft}
          />
          <NumberInput
            size="xs"
            label="Max sqft"
            value={maxSqft}
            onChange={setMaxSqft}
          />
        </Group>

        <Button
          size="xs"
          onClick={handleSearch}
          loading={loading}
          disabled={subjectLat === null}
        >
          Find Comps
        </Button>

        {error && (
          <Text size="xs" c="red">
            {error}
          </Text>
        )}

        {unmapped > 0 && (
          <Text size="xs" c="dimmed">
            {unmapped} of {comps.length} sales carry no coordinates and are not drawn.
          </Text>
        )}

        {comps.length > 0 && (
          <>
            <Divider label="Summary" labelPosition="left" />
            <Group gap="md">
              <Badge size="lg" variant="light" color="blue">
                {comps.length} comps
              </Badge>
              <Group gap={4}>
                <IconCurrencyDollar size={14} />
                <Text size="xs" fw={600}>
                  Avg: ${avgPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </Text>
              </Group>
              <Text size="xs" c="dimmed">
                ${avgPpsf.toFixed(0)}/sqft
              </Text>
            </Group>

            <Divider label="Sales" labelPosition="left" />
            <ScrollArea h={300}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Address</Table.Th>
                    <Table.Th>Price</Table.Th>
                    <Table.Th>$/sqft</Table.Th>
                    <Table.Th>Date</Table.Th>
                    <Table.Th>Dist</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {comps.map((comp, i) => (
                    <Table.Tr
                      key={i}
                      style={{ cursor: 'pointer' }}
                      onClick={() => onFlyTo(comp.lat, comp.lng, 18)}
                    >
                      <Table.Td>
                        <Group gap={4}>
                          <IconMapPin size={12} />
                          <Text size="xs">{comp.address}</Text>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" fw={500}>
                          ${comp.salePrice.toLocaleString()}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs">${comp.pricePerSqft.toFixed(0)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs">{comp.saleDate}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs">{comp.distance.toFixed(2)} mi</Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </>
        )}
      </Stack>
    </Paper>
  );
}
