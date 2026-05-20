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
  Table,
  Divider,
  Select,
  ColorSwatch,
} from '@mantine/core';
import {
  IconSearch,
  IconX,
  IconMapPin,
  IconBuilding,
  IconRuler2,
  IconCurrencyDollar,
} from '@tabler/icons-react';

interface ParcelInfo {
  apn: string;
  address: string;
  owner: string;
  area: number;
  areaUnit: string;
  zoning: string;
  zoningColor: string;
  landUse: string;
  assessedValue: number;
  marketValue: number;
  yearBuilt: number | null;
  buildingArea: number | null;
  floodZone: string;
  geometry: GeoJSON.Geometry | null;
}

interface ParcelPanelProps {
  onFlyTo: (lat: number, lng: number, zoom?: number) => void;
  onHighlightParcel: (geometry: GeoJSON.Geometry | null) => void;
  onClose: () => void;
}

const ZONING_COLORS: Record<string, string> = {
  'R-1': '#4CAF50',
  'R-2': '#66BB6A',
  'R-3': '#81C784',
  'C-1': '#2196F3',
  'C-2': '#42A5F5',
  'C-3': '#64B5F6',
  'M-1': '#FF9800',
  'M-2': '#FFB74D',
  'I-1': '#9E9E9E',
  PUD: '#9C27B0',
  AG: '#8BC34A',
  OS: '#009688',
};

export function ParcelPanel({
  onFlyTo,
  onHighlightParcel,
  onClose,
}: ParcelPanelProps) {
  const [searchType, setSearchType] = useState<string | null>('apn');
  const [query, setQuery] = useState('');
  const [parcel, setParcel] = useState<ParcelInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setParcel(null);

    try {
      const params = new URLSearchParams({
        type: searchType || 'apn',
        q: query.trim(),
      });
      const res = await fetch(`/api/parcels/search?${params}`);
      if (!res.ok) {
        throw new Error(`Search failed: ${res.statusText}`);
      }
      const data = await res.json();
      if (data.features && data.features.length > 0) {
        const feature = data.features[0];
        const props = feature.properties;
        setParcel({
          apn: props.apn || props.parcel_id || '',
          address: props.address || props.situs || '',
          owner: props.owner || props.owner_name || '',
          area: props.area_sqft || props.shape_area || 0,
          areaUnit: 'sq ft',
          zoning: props.zoning || props.zone_code || 'Unknown',
          zoningColor: ZONING_COLORS[props.zoning] || '#757575',
          landUse: props.land_use || props.use_code_desc || '',
          assessedValue: props.assessed_value || props.total_av || 0,
          marketValue: props.market_value || props.total_mv || 0,
          yearBuilt: props.year_built || null,
          buildingArea: props.building_sqft || props.bldg_area || null,
          floodZone: props.flood_zone || 'X',
          geometry: feature.geometry,
        });
        // Fly to parcel centroid
        if (feature.geometry) {
          const centroid = computeCentroid(feature.geometry);
          if (centroid) {
            onFlyTo(centroid[1], centroid[0], 18);
          }
          onHighlightParcel(feature.geometry);
        }
      } else {
        setError('No parcel found for this query.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: number) =>
    val ? `$${val.toLocaleString()}` : '—';

  const formatArea = (val: number, unit: string) =>
    val ? `${val.toLocaleString()} ${unit}` : '—';

  return (
    <Paper p="sm" radius="md" withBorder>
      <Stack gap="xs">
        <Group justify="space-between">
          <Group gap="xs">
            <IconBuilding size={18} />
            <Text fw={600} size="sm">
              Parcels
            </Text>
          </Group>
          <ActionIcon size="sm" variant="subtle" onClick={onClose}>
            <IconX size={14} />
          </ActionIcon>
        </Group>

        <Select
          size="xs"
          value={searchType}
          onChange={setSearchType}
          data={[
            { value: 'apn', label: 'APN / Parcel ID' },
            { value: 'address', label: 'Address' },
            { value: 'owner', label: 'Owner Name' },
          ]}
        />

        <Group gap="xs">
          <TextInput
            size="xs"
            placeholder={
              searchType === 'apn'
                ? '123-456-789'
                : searchType === 'address'
                  ? '123 Main St'
                  : 'Smith, John'
            }
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            style={{ flex: 1 }}
          />
          <Button
            size="xs"
            onClick={handleSearch}
            loading={loading}
            leftSection={<IconSearch size={14} />}
          >
            Search
          </Button>
        </Group>

        {error && (
          <Text size="xs" c="red">
            {error}
          </Text>
        )}

        {parcel && (
          <ScrollArea h={400}>
            <Stack gap="xs">
              <Paper p="xs" withBorder>
                <Stack gap={4}>
                  <Group justify="space-between">
                    <Text size="xs" c="dimmed">
                      APN
                    </Text>
                    <Text size="xs" fw={600}>
                      {parcel.apn}
                    </Text>
                  </Group>
                  <Text size="sm" fw={500}>
                    {parcel.address}
                  </Text>
                  <Text size="xs" c="dimmed">
                    Owner: {parcel.owner}
                  </Text>
                </Stack>
              </Paper>

              <Divider label="Zoning & Land Use" labelPosition="left" />
              <Group gap="xs">
                <ColorSwatch color={parcel.zoningColor} size={16} />
                <Badge size="sm" variant="light">
                  {parcel.zoning}
                </Badge>
                <Text size="xs">{parcel.landUse}</Text>
              </Group>

              <Divider label="Valuation" labelPosition="left" />
              <Table>
                <Table.Tbody>
                  <Table.Tr>
                    <Table.Td>
                      <Group gap={4}>
                        <IconCurrencyDollar size={12} />
                        <Text size="xs">Assessed</Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" fw={500}>
                        {formatCurrency(parcel.assessedValue)}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Td>
                      <Group gap={4}>
                        <IconCurrencyDollar size={12} />
                        <Text size="xs">Market</Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" fw={500}>
                        {formatCurrency(parcel.marketValue)}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                </Table.Tbody>
              </Table>

              <Divider label="Dimensions" labelPosition="left" />
              <Table>
                <Table.Tbody>
                  <Table.Tr>
                    <Table.Td>
                      <Group gap={4}>
                        <IconRuler2 size={12} />
                        <Text size="xs">Lot Area</Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" fw={500}>
                        {formatArea(parcel.area, parcel.areaUnit)}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                  {parcel.buildingArea && (
                    <Table.Tr>
                      <Table.Td>
                        <Group gap={4}>
                          <IconBuilding size={12} />
                          <Text size="xs">Building</Text>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" fw={500}>
                          {formatArea(parcel.buildingArea, 'sq ft')}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                  {parcel.yearBuilt && (
                    <Table.Tr>
                      <Table.Td>
                        <Text size="xs">Year Built</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" fw={500}>
                          {parcel.yearBuilt}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>

              <Divider label="Flood Zone" labelPosition="left" />
              <Badge
                size="sm"
                color={parcel.floodZone === 'X' ? 'green' : 'red'}
                variant="light"
              >
                Zone {parcel.floodZone}
              </Badge>

              <Group gap="xs" mt="xs">
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconMapPin size={14} />}
                  onClick={() => {
                    if (parcel.geometry) {
                      const c = computeCentroid(parcel.geometry);
                      if (c) onFlyTo(c[1], c[0], 18);
                    }
                  }}
                >
                  Zoom To
                </Button>
              </Group>
            </Stack>
          </ScrollArea>
        )}
      </Stack>
    </Paper>
  );
}

function computeCentroid(
  geometry: GeoJSON.Geometry,
): [number, number] | null {
  const coords: number[][] = [];

  function extractCoords(g: GeoJSON.Geometry) {
    switch (g.type) {
      case 'Point':
        coords.push(g.coordinates as number[]);
        break;
      case 'MultiPoint':
      case 'LineString':
        (g.coordinates as number[][]).forEach((c) => coords.push(c));
        break;
      case 'MultiLineString':
      case 'Polygon':
        (g.coordinates as number[][][]).forEach((ring) =>
          ring.forEach((c) => coords.push(c)),
        );
        break;
      case 'MultiPolygon':
        (g.coordinates as number[][][][]).forEach((poly) =>
          poly.forEach((ring) => ring.forEach((c) => coords.push(c))),
        );
        break;
    }
  }

  extractCoords(geometry);
  if (coords.length === 0) return null;

  const sumX = coords.reduce((s, c) => s + c[0], 0);
  const sumY = coords.reduce((s, c) => s + c[1], 0);
  return [sumX / coords.length, sumY / coords.length];
}
