import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Divider, Group, ScrollArea, Select, Stack, Tabs, Text, TextInput } from '@mantine/core';
import { IconHierarchy2 } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../../components/PanelCard';
import { useAppStore } from '../../store/app';
import { useFeaturePickerStore } from '../../store/featurePicker';
import { useTiles3dLayerStore } from '../../store/tiles3dLayers';
import { elementIdColumn } from '../../viewer/tilesetStyle';
import { jwtClaims } from '../../lib/jwt';
import { useAuthStore } from '../auth/store';
import { BimModeControls } from '../bim/BimModeControls';
import { BcfIssues } from '../coordination/BcfIssues';
import { ModelIdsCheck } from '../coordination/ModelIdsCheck';
import { ModelVersions } from '../coordination/ModelVersions';
import { jobErrorText, newestAssetJob } from './assetJobs';
import {
  TiletopiaElementService,
  elementFilter,
  groupElements,
  listMatchingElements,
  meshedContentsOf,
  resolveElementIds,
  searchElements,
  searchMatchingElements,
  updateElementProperty,
  withMesh,
  type ElementDetail,
  type ElementGroups,
  type ElementProperty,
  type ElementRow,
  type ElementTreeNode,
} from './elementService';
import { ElementGeometry } from './ElementGeometry';
import { ElementRowButton, ElementTree } from './ElementTree';
import { flyToElements } from './flyToElements';
import { isIfcFileName, tiletopiaAssetId, useElementStore } from './store';

const CLASS_GROUP_KEY = '@classFullName';
const STOREY_GROUP_KEY = '@storey';

function groupNames({ groups }: ElementGroups): string[] {
  return groups.flatMap((group) => (typeof group.value === 'string' ? [group.value] : []));
}

function propertySets(
  properties: Record<string, ElementProperty>,
): [string, [string, string, ElementProperty][]][] {
  const sets = new Map<string, [string, string, ElementProperty][]>();
  for (const [key, property] of Object.entries(properties)) {
    const dot = key.indexOf('.');
    const setName = dot === -1 ? 'Other' : key.slice(0, dot);
    const propertyName = dot === -1 ? key : key.slice(dot + 1);
    sets.set(setName, [...(sets.get(setName) ?? []), [key, propertyName, property]]);
  }
  return [...sets.entries()];
}

function canEditProperties(token: string | null): boolean {
  const role = token ? jwtClaims(token)?.role : null;
  return role === 'editor' || role === 'admin';
}

function shownValue(value: ElementProperty['value']): string {
  return String(value);
}

function draftLiteral(draft: string, current: ElementProperty['value']): string | number | boolean {
  if (typeof current === 'boolean') {
    if (draft === 'true' || draft === 'false') return draft === 'true';
    return draft;
  }
  if (typeof current === 'number') {
    const trimmed = draft.trim();
    if (trimmed !== '' && Number.isFinite(Number(trimmed))) return Number(trimmed);
    return draft;
  }
  return draft;
}

function PropertyValueEditor({
  name,
  propertyKey,
  property,
  onSave,
}: {
  name: string;
  propertyKey: string;
  property: ElementProperty;
  onSave: (key: string, value: string | number | boolean) => Promise<void>;
}) {
  const [draft, setDraft] = useState(shownValue(property.value));
  const [savedValue, setSavedValue] = useState(property.value);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (savedValue !== property.value) {
    setSavedValue(property.value);
    setDraft(shownValue(property.value));
    setError(null);
  }

  const save = () => {
    const next = draftLiteral(draft, property.value);
    if (next === property.value || saving) return;
    setSaving(true);
    setError(null);
    onSave(propertyKey, next)
      .catch((failure: unknown) => {
        setError(failure instanceof Error ? failure.message : 'The property could not be saved.');
      })
      .finally(() => setSaving(false));
  };

  return (
    <>
      <TextInput
        aria-label={name}
        size="xs"
        value={draft}
        disabled={saving}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') save();
        }}
      />
      {error && (
        <Text size="xs" c="red" data-testid="property-edit-error">
          {error}
        </Text>
      )}
    </>
  );
}

function ElementProperties({
  detail,
  canEdit,
  onSave,
}: {
  detail: ElementDetail;
  canEdit: boolean;
  onSave: (key: string, value: string | number | boolean) => Promise<void>;
}) {
  return (
    <Stack gap={4} data-testid="element-properties">
      <Text size="xs" c="white" fw={600}>
        {detail.label ?? detail.id}
      </Text>
      <Text size="xs" c="dimmed">
        {detail.ifcClass}
        {detail.storey ? ` on ${detail.storey}` : ''}
      </Text>
      {propertySets(detail.properties).map(([setName, entries]) => (
        <Stack gap={2} key={setName} data-testid={`element-property-set-${setName}`}>
          <Divider label={setName} labelPosition="left" />
          <dl style={{ margin: 0, fontSize: 'var(--mantine-font-size-xs)' }}>
            {entries.map(([key, name, property]) => (
              <div key={key} style={{ marginBottom: 4 }}>
                <dt style={{ color: 'var(--mantine-color-violet-4)' }}>{name}</dt>
                <dd style={{ margin: 0, color: 'var(--mantine-color-dark-0)', overflowWrap: 'anywhere' }}>
                  {canEdit ? (
                    <PropertyValueEditor name={name} propertyKey={key} property={property} onSave={onSave} />
                  ) : (
                    property.displayValue
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </Stack>
      ))}
    </Stack>
  );
}

function ModelElements({
  assetId,
  sceneControlsEnabled,
  onError,
  clearError,
}: {
  assetId: string;
  sceneControlsEnabled: boolean;
  onError: (failure: unknown) => void;
  clearError: () => void;
}) {
  const service = useMemo(() => new TiletopiaElementService(assetId), [assetId]);
  const selected = useElementStore((s) => s.selected);
  const hidden = useElementStore((s) => s.hidden);
  const isolated = useElementStore((s) => s.isolated);
  const focused = useElementStore((s) => s.focused);
  const token = useAuthStore((s) => s.token);
  const canEdit = canEditProperties(token);

  const [classNames, setClassNames] = useState<string[]>([]);
  const [storeyNames, setStoreyNames] = useState<string[]>([]);
  const [ifcClass, setIfcClass] = useState<string | null>(null);
  const [storey, setStorey] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [activeSearch, setActiveSearch] = useState<string | null>(null);
  const [rows, setRows] = useState<ElementRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [nextPage, setNextPage] = useState<string | undefined>(undefined);
  const [detail, setDetail] = useState<ElementDetail | null>(null);
  const [tilingWarning, setTilingWarning] = useState<string | null>(null);
  const [resolvingLabel, setResolvingLabel] = useState<string | null>(null);
  const [nothingToChoose, setNothingToChoose] = useState<string | null>(null);
  const latestChoice = useRef(0);

  const filter = useMemo(
    () => elementFilter({ ifcClass: ifcClass ?? undefined, storey: storey ?? undefined }),
    [ifcClass, storey],
  );
  const filtering = ifcClass !== null || storey !== null;
  const showingRows = filtering || activeSearch !== null;

  useEffect(() => {
    clearError();
  }, [focused, filter, activeSearch, clearError]);

  useEffect(() => {
    let cancelled = false;
    newestAssetJob(assetId)
      .then((job) => {
        if (!cancelled) setTilingWarning(jobErrorText(job));
      })
      .catch(onError);
    return () => {
      cancelled = true;
    };
  }, [assetId, onError]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([groupElements(assetId, CLASS_GROUP_KEY), groupElements(assetId, STOREY_GROUP_KEY)])
      .then(([classes, storeys]) => {
        if (cancelled) return;
        setClassNames(groupNames(classes));
        setStoreyNames(groupNames(storeys));
      })
      .catch(onError);
    return () => {
      cancelled = true;
    };
  }, [assetId, onError]);

  const readRows = useCallback(
    async (
      continuationToken: string | undefined,
    ): Promise<{ items: ElementRow[]; total: number | null; continuationToken?: string }> => {
      if (activeSearch !== null) {
        const page = await searchElements(assetId, activeSearch, continuationToken);
        return { items: page.items, continuationToken: page.continuationToken, total: null };
      }
      return service.listElements({ filter, continuationToken });
    },
    [assetId, service, filter, activeSearch],
  );

  useEffect(() => {
    if (!showingRows) return;
    let cancelled = false;
    readRows(undefined)
      .then((page) => {
        if (cancelled) return;
        setRows(page.items);
        setTotal(page.total);
        setNextPage(page.continuationToken);
      })
      .catch(onError);
    return () => {
      cancelled = true;
    };
  }, [showingRows, readRows, onError]);

  useEffect(() => {
    if (!focused) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    service
      .getElement(focused.id)
      .then((element) => {
        if (cancelled) return;
        setDetail(element);
      })
      .catch(onError);
    return () => {
      cancelled = true;
    };
  }, [service, focused, onError]);

  const readMoreRows = () => {
    readRows(nextPage)
      .then((page) => {
        setRows((known) => [...known, ...page.items]);
        setNextPage(page.continuationToken);
      })
      .catch(onError);
  };

  const selectMatches = () => {
    const matches: Promise<ElementRow[]> =
      activeSearch !== null
        ? searchMatchingElements(assetId, activeSearch)
        : listMatchingElements(service, filter);
    setNothingToChoose(null);
    matches
      .then((found) => {
        const located = withMesh(found);
        if (located.length === 0) {
          setNothingToChoose('None of these matches has a mesh, so none can be selected, hidden or isolated.');
          return;
        }
        useElementStore.getState().selectElements(located.map((row) => row.id));
      })
      .catch(onError);
  };

  const chooseContents = async (
    id: string,
    label: string,
    additive: boolean,
    readContents: () => Promise<ElementRow[]>,
  ) => {
    latestChoice.current += 1;
    const choice = latestChoice.current;
    setNothingToChoose(null);
    if (!sceneControlsEnabled) {
      useElementStore.getState().focusElement(id);
      return;
    }
    setResolvingLabel(label);
    try {
      const contents = await readContents();
      if (choice !== latestChoice.current) return;
      const store = useElementStore.getState();
      if (contents.length === 0) {
        store.focusElement(id);
        setNothingToChoose(
          `${label} has no mesh and nothing with a mesh inside it, so it cannot be selected, hidden or isolated.`,
        );
        return;
      }
      store.selectElement(id, {
        additive,
        fromScene: false,
        contents: contents.map((row) => row.id),
      });
      flyToElements(contents);
    } catch (failure) {
      if (choice === latestChoice.current) onError(failure);
    } finally {
      if (choice === latestChoice.current) setResolvingLabel(null);
    }
  };

  const onSelectNode = (node: ElementTreeNode, additive: boolean) => {
    void chooseContents(node.id, node.label, additive, () => meshedContentsOf(service, node));
  };

  const onSelectRow = (row: ElementRow, additive: boolean) => {
    void chooseContents(row.id, row.label ?? row.ifcClass, additive, async () => {
      const { located } = await resolveElementIds(service, [row.id]);
      return located;
    });
  };

  const hideSelected = () => {
    try {
      const store = useElementStore.getState();
      store.hideElements(store.selected);
      store.clearSelection();
    } catch (failure) {
      onError(failure);
    }
  };

  const isolateSelected = () => {
    const store = useElementStore.getState();
    try {
      store.isolateElements(store.selected);
    } catch (failure) {
      onError(failure);
    }
  };

  const showAll = () => {
    const store = useElementStore.getState();
    store.showHidden();
    store.endIsolation();
  };

  return (
    <Stack gap="xs" style={{ minHeight: 0 }}>
      {tilingWarning && (
        <Text size="xs" c="yellow" lineClamp={4} title={tilingWarning} data-testid="elements-tiling-warning">
          {tilingWarning}
        </Text>
      )}
      <Group gap={4} wrap="nowrap" align="flex-end">
        <TextInput
          size="xs"
          flex={1}
          label="Search elements"
          value={searchText}
          onChange={(event) => setSearchText(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') setActiveSearch(searchText.trim() || null);
          }}
        />
        <Button size="xs" variant="light" color="violet" onClick={() => setActiveSearch(searchText.trim() || null)}>
          Search
        </Button>
      </Group>
      <Group gap={4} wrap="nowrap" grow>
        <Select
          size="xs"
          label="Class"
          clearable
          disabled={activeSearch !== null}
          data={classNames}
          value={ifcClass}
          onChange={setIfcClass}
        />
        <Select
          size="xs"
          label="Storey"
          clearable
          disabled={activeSearch !== null}
          data={storeyNames}
          value={storey}
          onChange={setStorey}
        />
      </Group>

      <Group gap={4}>
        <Button
          size="compact-xs"
          variant="light"
          color="violet"
          disabled={selected.size === 0 || !sceneControlsEnabled}
          onClick={hideSelected}
        >
          Hide
        </Button>
        <Button
          size="compact-xs"
          variant="light"
          color="violet"
          disabled={selected.size === 0 || !sceneControlsEnabled}
          onClick={isolateSelected}
        >
          Isolate
        </Button>
        <Button
          size="compact-xs"
          variant="subtle"
          color="gray"
          disabled={hidden.size === 0 && isolated === null}
          onClick={showAll}
        >
          Show all
        </Button>
        <Button
          size="compact-xs"
          variant="subtle"
          color="gray"
          disabled={selected.size === 0}
          onClick={() => useElementStore.getState().clearSelection()}
        >
          Clear selection
        </Button>
      </Group>
      <Text size="xs" c="dimmed" data-testid="element-counts">
        {selected.size} selected, {hidden.size} hidden
        {isolated ? `, ${isolated.size} isolated` : ''}
      </Text>
      {resolvingLabel && (
        <Text size="xs" c="dimmed" data-testid="element-resolving">
          Finding what is in {resolvingLabel}.
        </Text>
      )}
      {nothingToChoose && (
        <Text size="xs" c="yellow" data-testid="element-nothing-to-choose">
          {nothingToChoose}
        </Text>
      )}

      <ScrollArea.Autosize mah={280}>
        {showingRows ? (
          <Stack gap={2} data-testid="element-rows">
            <Group justify="space-between">
              <Text size="xs" c="dimmed">
                {total === null ? `${rows.length} found` : `${total} match`}
              </Text>
              <Button
                size="compact-xs"
                variant="subtle"
                color="violet"
                disabled={!sceneControlsEnabled}
                onClick={selectMatches}
              >
                Select all matches
              </Button>
            </Group>
            {rows.map((row) => (
              <ElementRowButton
                key={row.id}
                id={row.id}
                label={row.label ?? row.ifcClass}
                ifcClass={row.ifcClass}
                selected={selected.has(row.id) || focused?.id === row.id}
                hidden={hidden.has(row.id)}
                revealed={false}
                onSelect={(_id, additive) => onSelectRow(row, additive)}
              />
            ))}
            {nextPage !== undefined && (
              <Button size="compact-xs" variant="subtle" color="gray" onClick={readMoreRows}>
                More results
              </Button>
            )}
          </Stack>
        ) : (
          <ElementTree
            service={service}
            selected={selected}
            hidden={hidden}
            focusedId={focused?.id ?? null}
            revealId={focused?.fromScene ? focused.id : null}
            onSelectNode={onSelectNode}
            onError={onError}
          />
        )}
      </ScrollArea.Autosize>

      {detail && (
        <ScrollArea.Autosize mah={240}>
          <ElementProperties
            key={detail.id}
            detail={detail}
            canEdit={canEdit}
            onSave={async (key, value) => {
              const saved = await updateElementProperty(assetId, detail.id, key, value);
              setDetail((current) =>
                current?.id === detail.id
                  ? { ...current, properties: { ...current.properties, [key]: saved } }
                  : current,
              );
            }}
          />
        </ScrollArea.Autosize>
      )}
      {detail && (
        <ScrollArea.Autosize mah={220}>
          <ElementGeometry assetId={assetId} elementId={detail.id} canEdit={canEdit} signedIn={token !== null} />
        </ScrollArea.Autosize>
      )}
    </Stack>
  );
}

export function ElementPanel({ onClose }: { onClose: () => void }) {
  const signedIn = useAuthStore((s) => !!s.token);
  const renderer = useAppStore((s) => s.renderer);
  const activeTab = useAppStore((s) => s.activeTab);
  const layers = useTiles3dLayerStore((s) => s.layers);
  const model = useElementStore((s) => s.model);
  const loaded = useTiles3dLayerStore((s) => s.loaded);
  const [error, setError] = useState<string | null>(null);

  const assetLayers = useMemo(
    () => layers.filter((layer) => tiletopiaAssetId(layer.url) !== null),
    [layers],
  );

  useEffect(() => {
    if (!model && assetLayers.length === 1) useElementStore.getState().openModel(assetLayers[0]);
  }, [model, assetLayers]);

  // useFeaturePickerCesium binds clicks only while enabled, and the Feature Info panel needs it enabled too
  useEffect(() => {
    useFeaturePickerStore.getState().setEnabled(true);
    return () => {
      if (useAppStore.getState().activePanel === 'featurePicker') return;
      useFeaturePickerStore.getState().setEnabled(false);
    };
  }, []);

  const onError = useCallback((failure: unknown) => {
    setError(failure instanceof Error ? failure.message : String(failure));
  }, []);
  const clearError = useCallback(() => setError(null), []);

  const chooseModel = (layerId: string | null) => {
    const layer = layers.find((known) => known.id === layerId);
    if (!layer) return;
    setError(null);
    useElementStore.getState().openModel(layer);
  };

  const onCesium = activeTab === 'globe' && renderer === 'cesium';
  const assetId = model?.assetId ?? null;
  const tileset = model ? loaded[model.layerId] : undefined;
  const hasNoElementIds = tileset !== undefined && elementIdColumn(tileset) === 'absent';
  const canShowInScene = onCesium && tileset !== undefined && !hasNoElementIds;
  const isIfcModel = model !== null && isIfcFileName(model.name);

  return (
    <PanelCard width={340} maxHeight="80vh" testId="element-panel">
      <PanelHeader
        icon={<IconHierarchy2 size={16} />}
        title="Model Elements"
        onClose={onClose}
        badge={
          model && (
            <Badge size="xs" variant="light" color="violet">
              {model.name}
            </Badge>
          )
        }
      />
      <Stack gap="xs">
        {!signedIn && (
          <Text size="xs" c="dimmed" data-testid="elements-signin">
            Sign in to browse the elements of a model.
          </Text>
        )}
        {signedIn && assetLayers.length === 0 && (
          <Text size="xs" c="dimmed" data-testid="elements-empty">
            No model from the Assets panel is on the globe. Add a ready IFC asset there first.
          </Text>
        )}
        {signedIn && assetLayers.length > 0 && (
          <Select
            size="xs"
            label="Model"
            allowDeselect={false}
            data={assetLayers.map((layer) => ({ value: layer.id, label: layer.name }))}
            value={model?.layerId ?? null}
            onChange={chooseModel}
          />
        )}
        {!onCesium && (
          <Text size="xs" c="dimmed" data-testid="elements-cesium-note">
            Cesium only: switch renderer to CesiumJS to see selections in the model.
          </Text>
        )}
        {onCesium && model && <BimModeControls model={model} tileset={tileset} />}
        {error && (
          <Text size="xs" c="red" data-testid="elements-error">
            {error}
          </Text>
        )}
        {signedIn && model && assetId === null && (
          <Text size="xs" c="dimmed" data-testid="elements-not-tiletopia">
            {model.name} is not a tiletopia asset, so it has no element tree or properties.
          </Text>
        )}
        {signedIn && hasNoElementIds && (
          <Text size="xs" c="yellow" data-testid="elements-no-id-column">
            The tiles of this model have no asset_id column, so selecting, hiding and isolating cannot reach them.
          </Text>
        )}
        {signedIn && model && assetId !== null && (
          <Tabs key={assetId} defaultValue="elements" keepMounted={false}>
            <Tabs.List mb="xs">
              <Tabs.Tab value="elements">Elements</Tabs.Tab>
              <Tabs.Tab value="issues">Issues</Tabs.Tab>
              <Tabs.Tab value="versions">Versions</Tabs.Tab>
              {isIfcModel && <Tabs.Tab value="ids">IDS</Tabs.Tab>}
            </Tabs.List>
            <Tabs.Panel value="elements">
              <ModelElements
                assetId={assetId}
                sceneControlsEnabled={!hasNoElementIds}
                onError={onError}
                clearError={clearError}
              />
            </Tabs.Panel>
            <Tabs.Panel value="issues">
              <BcfIssues assetId={assetId} modelName={model.name} tileset={onCesium ? tileset : undefined} />
            </Tabs.Panel>
            <Tabs.Panel value="versions">
              <ModelVersions assetId={assetId} canShowInScene={canShowInScene} />
            </Tabs.Panel>
            {isIfcModel && (
              <Tabs.Panel value="ids">
                <ModelIdsCheck assetId={assetId} canShowInScene={canShowInScene} />
              </Tabs.Panel>
            )}
          </Tabs>
        )}
      </Stack>
    </PanelCard>
  );
}
