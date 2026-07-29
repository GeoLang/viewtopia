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
  IconPlus,
} from '@tabler/icons-react';
import { searchParcels, parcelCentroid, type ParcelRecord } from '../../lib/realEstate';

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
  branchId: string | null;
  onFlyTo: (lat: number, lng: number, zoom?: number) => void;
  onHighlightParcel: (geometry: GeoJSON.Geometry | null) => void;
  /** omitted when embedded in the real-estate plugin tabs, which has its own close */
  onClose?: () => void;
  onSubjectFound?: (lat: number, lng: number) => void;
  onAddToSelection?: (parcel: ParcelRecord) => void;
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
  branchId,
  onFlyTo,
  onHighlightParcel,
  onClose,
  onSubjectFound,
  onAddToSelection,
}: ParcelPanelProps) {
  const [searchType, setSearchType] = useState<string | null>('apn');
  const [query, setQuery] = useState('');
  const [parcel, setParcel] = useState<ParcelInfo | null>(null);
  const [record, setRecord] = useState<ParcelRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    if (!branchId) {
      setError('Parcel dataset not loaded. Run scripts/seed-parcels.mjs.');
      return;
    }
    setLoading(true);
    setError(null);
    setParcel(null);
    setRecord(null);

    try {
      const results = await searchParcels(branchId, searchType || 'apn', query.trim(), 1);
      if (results.length === 0) {
        setError('No parcel found for this query.');
        return;
      }
      const r = results[0];
      const props = r.properties;
      const num = (key: string): number => {
        const v = props[key];
        return typeof v === 'number' ? v : 0;
      };
      setRecord(r);
      setParcel({
        apn: r.apn,
        address: r.address,
        owner: r.owner,
        area: r.sqft || num('area_sqft'),
        areaUnit: 'sq ft',
        zoning: r.zoning || 'Unknown',
        zoningColor: ZONING_COLORS[r.zoning] || '#757575',
        landUse: typeof props.land_use === 'string' ? props.land_use : '',
        assessedValue: num('assessed_value'),
        marketValue: num('market_value'),
        yearBuilt: num('year_built') || null,
        buildingArea: num('building_sqft') || null,
        floodZone: typeof props.flood_zone === 'string' ? props.flood_zone : 'X',
        geometry: r.geometry,
      });
      if (r.geometry) {
        const centroid = parcelCentroid(r);
        if (centroid) {
          onFlyTo(centroid[1], centroid[0], 18);
          onSubjectFound?.(centroid[1], centroid[0]);
        }
        onHighlightParcel(r.geometry);
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
          {onClose && (
            <ActionIcon size="sm" variant="subtle" onClick={onClose}>
              <IconX size={14} />
            </ActionIcon>
          )}
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
                    if (record) {
                      const c = parcelCentroid(record);
                      if (c) onFlyTo(c[1], c[0], 18);
                    }
                  }}
                >
                  Zoom To
                </Button>
                {onAddToSelection && record && (
                  <Button
                    size="xs"
                    variant="light"
                    color="grape"
                    leftSection={<IconPlus size={14} />}
                    onClick={() => onAddToSelection(record)}
                  >
                    Add to selection
                  </Button>
                )}
              </Group>
            </Stack>
          </ScrollArea>
        )}
      </Stack>
    </Paper>
  );
}
