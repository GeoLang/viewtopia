import { useMemo, useState } from 'react';
import {
  Button,
  Divider,
  Group,
  NumberInput,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { IconLayoutBoardSplit } from '@tabler/icons-react';
import { PanelCard, PanelHeader } from '../../components/PanelCard';
import { useAgentLayerStore } from '../../store/agentLayers';
import { useAppStore } from '../../store/app';
import { MAX_ATLAS_PAGES, atlasFields, atlasPages } from './atlas';
import { buildPdfPages } from './build';
import { CAPTURE_REFUSAL, activeMapCapture } from './capture';
import { type ImageFormat, exportPixelSize, mapImageDataUrl } from './imageExport';
import { legendGroups } from './legend';
import type { PageOrientation, PageSizeName } from './page';
import { downloadPdf } from './pdf';

type OutputFormat = 'pdf' | ImageFormat;

const PAGE_SIZE_OPTIONS: { value: PageSizeName; label: string }[] = [
  { value: 'a4', label: 'A4' },
  { value: 'a3', label: 'A3' },
  { value: 'letter', label: 'Letter' },
  { value: 'legal', label: 'Legal' },
];

const DEFAULT_ATLAS_MARGIN_PERCENT = 10;

function download(dataUrl: string, fileName: string) {
  const link = document.createElement('a');
  link.download = fileName;
  link.href = dataUrl;
  link.click();
}

/**
 * Composes a page around the map rather than screenshotting the window: page
 * size and margins, a title, a scale bar, a north arrow and the layer legend,
 * out as PDF. An atlas repeats that page over a layer's features.
 */
export function PrintLayoutPanel({ onClose }: { onClose: () => void }) {
  const [format, setFormat] = useState<OutputFormat>('pdf');
  const [size, setSize] = useState<PageSizeName>('a4');
  const [orientation, setOrientation] = useState<PageOrientation>('landscape');
  const [marginMm, setMarginMm] = useState<number | string>(10);
  const [title, setTitle] = useState('');
  const [showScaleBar, setShowScaleBar] = useState(true);
  const [showNorthArrow, setShowNorthArrow] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const [atlasOn, setAtlasOn] = useState(false);
  const [atlasLayerId, setAtlasLayerId] = useState<string | null>(null);
  const [atlasField, setAtlasField] = useState<string | null>(null);
  const [atlasMarginPercent, setAtlasMarginPercent] = useState<number | string>(
    DEFAULT_ATLAS_MARGIN_PERCENT,
  );
  const [imageWidth, setImageWidth] = useState<number | string>(1920);
  const [imageHeight, setImageHeight] = useState<number | string>(1080);
  const [dpi, setDpi] = useState<number | string>(150);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const layers = useAgentLayerStore((s) => s.layers);
  const renderer = useAppStore((s) => s.renderer);
  const atlasFeatures = useMemo(
    () => layers.find((l) => l.id === atlasLayerId)?.geojson.features ?? [],
    [layers, atlasLayerId],
  );
  const fields = useMemo(() => atlasFields(atlasFeatures), [atlasFeatures]);
  const atlas = useMemo(
    () => atlasPages(atlasFeatures, atlasField, (Number(atlasMarginPercent) || 0) / 100),
    [atlasFeatures, atlasField, atlasMarginPercent],
  );

  const imageSize = exportPixelSize(
    Number(imageWidth) || 0,
    Number(imageHeight) || 0,
    Number(dpi) || 0,
  );
  const atlasOnPdf = format === 'pdf' && atlasOn;
  const atlasEntries = atlasOnPdf && atlas.pages.length > 0 ? atlas.pages : null;

  const handleExport = async () => {
    setStatus(null);
    const capture = activeMapCapture();
    if (!capture) {
      setStatus(CAPTURE_REFUSAL);
      return;
    }

    setBusy(true);
    try {
      if (format !== 'pdf') {
        const dataUrl = mapImageDataUrl(capture, format, imageSize);
        if (!dataUrl || dataUrl === 'data:,') {
          setStatus('Export returned an empty image');
          return;
        }
        download(dataUrl, `viewtopia-export.${format}`);
        setStatus('Exported.');
        return;
      }

      const pages = await buildPdfPages(capture, {
        setup: { size, orientation, marginMm: Number(marginMm) || 0 },
        title,
        legend: showLegend ? legendGroups(layers) : [],
        scaleBar: showScaleBar,
        northArrow: showNorthArrow,
        atlas: atlasEntries,
        dpi: Number(dpi) || 0,
      });
      downloadPdf(pages, atlasEntries ? 'viewtopia-atlas.pdf' : 'viewtopia-layout.pdf');
      setStatus(`Exported ${pages.length} page${pages.length === 1 ? '' : 's'}.`);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : 'Export failed, the canvas may be cross-origin tainted',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <PanelCard width={300} maxHeight="80vh" testId="print-layout-panel">
      <PanelHeader
        icon={<IconLayoutBoardSplit size={16} />}
        title="Print Layout"
        onClose={onClose}
      />

      <ScrollArea flex={1}>
        <Stack gap="xs">
          <Select
            size="xs"
            label="Format"
            data={[
              { value: 'pdf', label: 'PDF page' },
              { value: 'png', label: 'PNG' },
              { value: 'jpg', label: 'JPEG' },
            ]}
            value={format}
            onChange={(v) => setFormat((v || 'pdf') as OutputFormat)}
            allowDeselect={false}
          />

          {format === 'pdf' ? (
            <>
              <Select
                size="xs"
                label="Page size"
                data={PAGE_SIZE_OPTIONS}
                value={size}
                onChange={(v) => setSize((v || 'a4') as PageSizeName)}
                allowDeselect={false}
              />
              <SegmentedControl
                size="xs"
                fullWidth
                value={orientation}
                onChange={(v) => setOrientation(v as PageOrientation)}
                data={[
                  { value: 'portrait', label: 'Portrait' },
                  { value: 'landscape', label: 'Landscape' },
                ]}
              />
              <NumberInput
                size="xs"
                label="Margin (mm)"
                value={marginMm}
                onChange={setMarginMm}
                min={0}
                max={60}
              />
              <TextInput
                size="xs"
                label="Title"
                placeholder="Leave empty for no title"
                value={title}
                onChange={(e) => setTitle(e.currentTarget.value)}
                disabled={atlasOn}
              />
              <Switch
                size="xs"
                label="Scale bar"
                checked={showScaleBar}
                onChange={(e) => setShowScaleBar(e.currentTarget.checked)}
              />
              <Switch
                size="xs"
                label="North arrow"
                checked={showNorthArrow}
                onChange={(e) => setShowNorthArrow(e.currentTarget.checked)}
              />
              <Switch
                size="xs"
                label="Legend"
                checked={showLegend}
                onChange={(e) => setShowLegend(e.currentTarget.checked)}
              />

              <Divider label="Atlas" labelPosition="center" />

              <Switch
                size="xs"
                label="One page per feature"
                checked={atlasOn}
                onChange={(e) => setAtlasOn(e.currentTarget.checked)}
              />

              {atlasOn && (
                <>
                  <Select
                    size="xs"
                    label="Coverage layer"
                    placeholder="Pick a vector layer"
                    data={layers.map((l) => ({ value: l.id, label: l.name }))}
                    value={atlasLayerId}
                    onChange={setAtlasLayerId}
                    nothingFoundMessage="No layers loaded"
                  />
                  <Select
                    size="xs"
                    label="Page title from"
                    placeholder="Feature number"
                    data={fields}
                    value={atlasField}
                    onChange={setAtlasField}
                    clearable
                  />
                  <NumberInput
                    size="xs"
                    label="Feature margin (%)"
                    value={atlasMarginPercent}
                    onChange={setAtlasMarginPercent}
                    min={0}
                    max={100}
                  />
                  <Text size="xs" c={atlas.total > MAX_ATLAS_PAGES ? 'yellow' : 'dimmed'} data-testid="atlas-pages">
                    {atlas.total > MAX_ATLAS_PAGES
                      ? `${atlas.total} features, capped at the first ${MAX_ATLAS_PAGES} pages`
                      : `${atlas.pages.length} page${atlas.pages.length === 1 ? '' : 's'}`}
                  </Text>
                </>
              )}
            </>
          ) : (
            <>
              <Group gap="xs" grow>
                <NumberInput
                  size="xs"
                  label="Width"
                  value={imageWidth}
                  onChange={setImageWidth}
                  min={100}
                  max={8000}
                />
                <NumberInput
                  size="xs"
                  label="Height"
                  value={imageHeight}
                  onChange={setImageHeight}
                  min={100}
                  max={8000}
                />
              </Group>
              <Text size="xs" c="dimmed" data-testid="printexport-size">
                Output: {imageSize.width} × {imageSize.height} px, scaled from the live view
              </Text>
            </>
          )}

          <NumberInput size="xs" label="DPI" value={dpi} onChange={setDpi} min={72} max={600} />

          {format === 'pdf' && (
            <Text size="xs" c="dimmed" data-testid="print-fidelity">
              {renderer === 'maplibre'
                ? 'The map is drawn again at this DPI for the page.'
                : 'The 3D view goes on the page as the live frame, at screen resolution.'}
            </Text>
          )}

          <Button
            size="xs"
            variant="filled"
            color="violet"
            onClick={handleExport}
            loading={busy}
            disabled={atlasOnPdf && !atlasEntries}
            fullWidth
          >
            Export
          </Button>

          {status && (
            <Text size="xs" c={status.startsWith('Exported') ? 'green' : 'red'} ta="center">
              {status}
            </Text>
          )}
        </Stack>
      </ScrollArea>
    </PanelCard>
  );
}
