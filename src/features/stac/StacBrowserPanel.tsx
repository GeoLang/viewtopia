import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Group,
  NumberInput,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconChevronRight,
  IconPlus,
  IconStar,
  IconStarFilled,
  IconWorldSearch,
  IconX,
} from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../../components/PanelCard';
import { PanelEmptyState, PanelSkeleton } from '../../components/PanelStates';
import { useAgentLayerStore } from '../../store/agentLayers';
import { getViewBounds } from '../../lib/viewBounds';
import { addStacAsset, assetLayerName } from './addAsset';
import { favoriteKey, useStacStore, type StacFavorite } from './store';
import {
  assetAction,
  catalogUrlRefusal,
  fetchCatalog,
  fetchItemPage,
  itemFootprints,
  itemRequest,
  STAC_CATALOGS,
  type AssetAction,
  type ItemFilters,
  type ItemRequest,
  type StacAsset,
  type StacCatalog,
  type StacCollection,
  type StacItem,
} from './client';

const ACTION_LABEL: Record<NonNullable<AssetAction>, string> = {
  geojson: 'Add layer',
  pmtiles: 'Add layer',
  tiles: 'Add layer',
  raster: 'Raster analysis',
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'The catalog request failed.';
}

export function StacBrowserPanel({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState(STAC_CATALOGS[0].url);
  const [catalog, setCatalog] = useState<StacCatalog | null>(null);
  const [collection, setCollection] = useState<StacCollection | null>(null);
  const [items, setItems] = useState<StacItem[]>([]);
  const [nextPage, setNextPage] = useState<ItemRequest | null>(null);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [itemQuery, setItemQuery] = useState('');
  const [maxCloudCover, setMaxCloudCover] = useState<string | number>('');
  const [inViewOnly, setInViewOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  const favorites = useStacStore((s) => s.favorites);
  const toggleFavorite = useStacStore((s) => s.toggleFavorite);
  const removeFavorite = useStacStore((s) => s.removeFavorite);
  const addVectorLayer = useAgentLayerStore((s) => s.addLayer);

  const saved = new Set(favorites.map((f) => favoriteKey(f.catalogUrl, f.collectionId)));
  const currentFavorite: StacFavorite | null = catalog && {
    catalogUrl: catalog.url,
    collectionId: collection?.id ?? null,
    title: collection ? `${catalog.title} / ${collection.title}` : catalog.title,
  };
  const query = filter.trim().toLowerCase();
  const shownCollections = (catalog?.collections ?? []).filter(
    (c) => !query || c.title.toLowerCase().includes(query) || c.id.toLowerCase().includes(query),
  );

  async function loadCatalog(catalogUrl: string): Promise<StacCatalog | null> {
    // refused before anything is cleared, so a typo leaves the open catalog alone
    const refusal = catalogUrlRefusal(catalogUrl);
    if (refusal) {
      setError(refusal);
      return null;
    }
    setBusy(true);
    setError(null);
    setStatus('');
    setCollection(null);
    setItems([]);
    setOpenItemId(null);
    setItemQuery('');
    try {
      const loaded = await fetchCatalog(catalogUrl);
      setCatalog(loaded);
      return loaded;
    } catch (e) {
      setCatalog(null);
      setError(message(e));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function loadItems(request: ItemRequest, append: boolean) {
    setBusy(true);
    setError(null);
    try {
      const page = await fetchItemPage(request);
      setItems((previous) => (append ? [...previous, ...page.items] : page.items));
      setNextPage(page.next);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  function filters(inView: boolean): ItemFilters {
    const bounds = inView ? getViewBounds() : null;
    return {
      text: itemQuery.trim(),
      bbox: bounds ? [bounds.west, bounds.south, bounds.east, bounds.north] : null,
      maxCloudCover: maxCloudCover === '' ? null : Number(maxCloudCover),
    };
  }

  async function openCollection(picked: StacCollection, from: StacCatalog) {
    setCollection(picked);
    setOpenItemId(null);
    setItems([]);
    setStatus('');
    await loadItems(itemRequest(from, picked, filters(inViewOnly)), false);
  }

  async function openFavorite(favorite: StacFavorite) {
    setUrl(favorite.catalogUrl);
    const loaded = await loadCatalog(favorite.catalogUrl);
    if (!loaded || !favorite.collectionId) return;
    const picked = loaded.collections.find((c) => c.id === favorite.collectionId);
    if (picked) await openCollection(picked, loaded);
  }

  function applyFilters(inView: boolean) {
    if (!catalog || !collection) return;
    void loadItems(itemRequest(catalog, collection, filters(inView)), false);
  }

  function toggleInView(checked: boolean) {
    setInViewOnly(checked);
    applyFilters(checked);
  }

  function addFootprints() {
    const geojson = itemFootprints(items);
    if (geojson.features.length === 0) {
      setStatus('These items carry no geometry.');
      return;
    }
    addVectorLayer(
      {
        id: crypto.randomUUID(),
        name: `${collection?.id ?? 'stac'} footprints`,
        color: '#a78bfa',
        geojson,
      },
      true,
    );
    setStatus(`Added ${geojson.features.length} footprints.`);
  }

  async function addAsset(item: StacItem, asset: StacAsset) {
    const name = assetLayerName(item.id, asset);
    setBusy(true);
    setStatus(`Loading ${name}…`);
    try {
      setStatus(await addStacAsset(item.id, asset));
    } catch (e) {
      setStatus(`${name}: ${message(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PanelCard width={380} maxHeight="70vh" testId="stac-panel">
      <PanelHeader
        icon={<IconWorldSearch size={16} />}
        title="STAC Browser"
        onClose={onClose}
        badge={
          catalog ? (
            <Badge size="xs" variant="light">
              {catalog.collections.length} collections
            </Badge>
          ) : null
        }
      />

      <Stack
        gap="xs"
        mb="xs"
        p="xs"
        style={{ background: 'var(--mantine-color-dark-6)', borderRadius: 4 }}
      >
        <Select
          size="xs"
          aria-label="Well-known catalog"
          placeholder="Well-known catalogs"
          data={STAC_CATALOGS.map((c) => ({ value: c.url, label: c.label }))}
          value={STAC_CATALOGS.some((c) => c.url === url) ? url : null}
          onChange={(picked) => picked && setUrl(picked)}
        />
        <Group gap="xs" wrap="nowrap">
          <TextInput
            size="xs"
            flex={1}
            aria-label="Catalog URL"
            placeholder="https://example.org/stac/v1"
            value={url}
            onChange={(e) => setUrl(e.currentTarget.value)}
          />
          <Button
            size="xs"
            color="violet"
            loading={busy && !catalog}
            disabled={!url.trim()}
            onClick={() => void loadCatalog(url.trim())}
          >
            Open
          </Button>
        </Group>
        {error && (
          <Text size="xs" c="red" data-testid="stac-error">
            {error}
          </Text>
        )}
      </Stack>

      {favorites.length > 0 && (
        <Stack gap={2} mb="xs" data-testid="stac-favorites">
          <Text size="xs" c="dimmed">
            Favourites
          </Text>
          {favorites.map((favorite) => (
            <Group
              key={favoriteKey(favorite.catalogUrl, favorite.collectionId)}
              gap={4}
              wrap="nowrap"
            >
              <Button
                size="compact-xs"
                variant="subtle"
                color="gray"
                flex={1}
                justify="flex-start"
                onClick={() => void openFavorite(favorite)}
              >
                {favorite.title}
              </Button>
              <ActionIcon
                size="xs"
                variant="subtle"
                color="red"
                aria-label={`Forget ${favorite.title}`}
                onClick={() =>
                  removeFavorite(favoriteKey(favorite.catalogUrl, favorite.collectionId))
                }
              >
                <IconX size={10} />
              </ActionIcon>
            </Group>
          ))}
        </Stack>
      )}

      {catalog && currentFavorite && (
        <Group gap={4} mb="xs" wrap="nowrap">
          {collection && (
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              aria-label="Back to collections"
              onClick={() => {
                setCollection(null);
                setItems([]);
                setOpenItemId(null);
              }}
            >
              <IconArrowLeft size={14} />
            </ActionIcon>
          )}
          <Text size="xs" c="white" lineClamp={1} flex={1}>
            {collection ? `${catalog.title} / ${collection.title}` : catalog.title}
          </Text>
          <ActionIcon
            size="sm"
            variant="subtle"
            color="yellow"
            aria-label={collection ? 'Save collection' : 'Save catalog'}
            onClick={() => toggleFavorite(currentFavorite)}
          >
            {saved.has(favoriteKey(catalog.url, collection?.id ?? null)) ? (
              <IconStarFilled size={14} />
            ) : (
              <IconStar size={14} />
            )}
          </ActionIcon>
        </Group>
      )}

      {catalog && !collection && (
        <TextInput
          size="xs"
          mb="xs"
          aria-label="Filter collections"
          placeholder="Filter collections"
          value={filter}
          onChange={(e) => setFilter(e.currentTarget.value)}
        />
      )}

      {collection && (
        <Stack gap="xs" mb="xs">
          <Group gap="xs" wrap="nowrap">
            <TextInput
              size="xs"
              flex={1}
              aria-label="Search items"
              placeholder="Search items"
              disabled={!catalog?.freeTextSearch}
              description={catalog?.freeTextSearch ? undefined : 'This catalog has no text search.'}
              value={itemQuery}
              onChange={(e) => setItemQuery(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyFilters(inViewOnly);
              }}
            />
            <Button
              size="xs"
              color="violet"
              loading={busy}
              onClick={() => applyFilters(inViewOnly)}
            >
              Search
            </Button>
          </Group>
          <NumberInput
            size="xs"
            aria-label="Maximum cloud cover"
            placeholder="Maximum cloud cover %"
            min={0}
            max={100}
            value={maxCloudCover}
            onChange={setMaxCloudCover}
          />
          <Checkbox
            size="xs"
            label="Only items in the current view"
            checked={inViewOnly}
            onChange={(e) => toggleInView(e.currentTarget.checked)}
          />
          <Button
            size="xs"
            variant="light"
            color="violet"
            leftSection={<IconPlus size={12} />}
            disabled={items.length === 0}
            onClick={addFootprints}
          >
            Add footprints
          </Button>
        </Stack>
      )}

      {status && (
        <Text size="xs" c="dimmed" mb="xs" data-testid="stac-status">
          {status}
        </Text>
      )}

      <ScrollArea flex={1}>
        {busy && items.length === 0 && <PanelSkeleton rows={4} />}

        {!catalog && !busy && (
          <PanelEmptyState message="Open a STAC catalog to browse its collections." />
        )}

        {catalog && !collection && !busy && shownCollections.length === 0 && (
          <PanelEmptyState message="This catalog lists no matching collections." />
        )}

        {catalog && !collection && (
          <Stack gap={4}>
            {shownCollections.map((c) => (
              <Group
                key={c.id}
                gap={4}
                p="xs"
                wrap="nowrap"
                style={{ background: 'var(--mantine-color-dark-6)', borderRadius: 4 }}
                data-testid={`stac-collection-${c.id}`}
              >
                <Stack gap={0} flex={1}>
                  <Text size="xs" c="white" lineClamp={1}>
                    {c.title}
                  </Text>
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {c.id}
                  </Text>
                </Stack>
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color="yellow"
                  aria-label={`Save ${c.id}`}
                  onClick={() =>
                    toggleFavorite({
                      catalogUrl: catalog.url,
                      collectionId: c.id,
                      title: `${catalog.title} / ${c.title}`,
                    })
                  }
                >
                  {saved.has(favoriteKey(catalog.url, c.id)) ? (
                    <IconStarFilled size={12} />
                  ) : (
                    <IconStar size={12} />
                  )}
                </ActionIcon>
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color="violet"
                  aria-label={`Browse ${c.id}`}
                  onClick={() => void openCollection(c, catalog)}
                >
                  <IconChevronRight size={12} />
                </ActionIcon>
              </Group>
            ))}
          </Stack>
        )}

        {collection && (
          <Stack gap={4}>
            {!busy && items.length === 0 && (
              <PanelEmptyState message="This collection returned no items here." />
            )}
            {items.map((item) => (
              <Stack
                key={item.id}
                gap={4}
                p="xs"
                style={{ background: 'var(--mantine-color-dark-6)', borderRadius: 4 }}
                data-testid={`stac-item-${item.id}`}
              >
                <Group gap={4} wrap="nowrap">
                  <Stack gap={0} flex={1}>
                    <Text size="xs" c="white" lineClamp={1}>
                      {item.id}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {item.datetime?.slice(0, 10) ?? 'no date'}
                    </Text>
                  </Stack>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="violet"
                    onClick={() => setOpenItemId(openItemId === item.id ? null : item.id)}
                  >
                    {`${item.assets.length} assets`}
                  </Button>
                </Group>
                {openItemId === item.id &&
                  item.assets.map((asset) => {
                    const action = assetAction(asset);
                    return (
                      <Group key={asset.key} gap={4} wrap="nowrap" pl="xs">
                        <Stack gap={0} flex={1}>
                          <Text size="xs" c="white" lineClamp={1}>
                            {asset.title}
                          </Text>
                          <Text size="xs" c="dimmed" lineClamp={1}>
                            {asset.mediaType || asset.href}
                          </Text>
                        </Stack>
                        {action ? (
                          <Button
                            size="compact-xs"
                            variant="light"
                            color="violet"
                            onClick={() => void addAsset(item, asset)}
                          >
                            {ACTION_LABEL[action]}
                          </Button>
                        ) : (
                          <Badge size="xs" color="gray" variant="light">
                            not drawable
                          </Badge>
                        )}
                      </Group>
                    );
                  })}
              </Stack>
            ))}
            {nextPage && (
              <Button
                size="xs"
                variant="subtle"
                color="violet"
                loading={busy}
                onClick={() => void loadItems(nextPage, true)}
              >
                Load more
              </Button>
            )}
          </Stack>
        )}
      </ScrollArea>
    </PanelCard>
  );
}
