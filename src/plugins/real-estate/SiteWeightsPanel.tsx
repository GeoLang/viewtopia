import { useMemo, useState } from 'react';
import { Button, Paper, ScrollArea, Slider, Stack, Table, Text } from '@mantine/core';
import { IconFileTypePdf } from '@tabler/icons-react';
import type { CompSale } from '../../components/tools/CompsPanel';
import { CAPTURE_REFUSAL, activeMapCapture } from '../../features/printLayout/capture';
import { mapImageDataUrl } from '../../features/printLayout/imageExport';
import { useAgentLayerStore } from '../../store/agentLayers';
import {
  criterionLabel,
  rankSites,
  siteShortlist,
  tradeAreaTable,
  type SiteShortlist,
} from './siteRanking';
import { type MapImage, siteReport, siteReportPdf } from './siteReport';

const MAXIMUM_WEIGHT = 10;
const WEIGHT_STEP = 1;
const SHORTLIST_HEIGHT_PX = 240;
const REPORT_FILE_NAME = 'site-report.pdf';
const ISO_DATE_LENGTH = 10;

function liveMapImage(): MapImage | null {
  const capture = activeMapCapture();
  if (!capture) return null;
  const canvas = capture.canvas();
  // a hidden canvas reports no layout size but still has pixels
  const size = {
    width: canvas.clientWidth || canvas.width,
    height: canvas.clientHeight || canvas.height,
  };
  return { dataUrl: mapImageDataUrl(capture, 'png', size), ...size };
}

function ShortlistWeights({ shortlist, comps }: { shortlist: SiteShortlist; comps: CompSale[] }) {
  const [weights, setWeights] = useState(shortlist.weights);
  const [status, setStatus] = useState<string | null>(null);
  const ranked = rankSites(shortlist.sites, weights);
  const sliderMaximum = Math.max(MAXIMUM_WEIGHT, ...Object.values(shortlist.weights));

  const handleReport = () => {
    try {
      const mapImage = liveMapImage();
      const report = siteReport(
        ranked,
        weights,
        tradeAreaTable(useAgentLayerStore.getState().layers),
        comps,
      );
      const createdOn = new Date().toISOString().slice(0, ISO_DATE_LENGTH);
      siteReportPdf(report, mapImage, createdOn).save(REPORT_FILE_NAME);
      setStatus(mapImage ? 'Report saved.' : `Report saved without the map. ${CAPTURE_REFUSAL}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Report failed, the map canvas may be cross-origin tainted');
    }
  };

  return (
    <Stack gap="xs">
      <Text size="xs" c="dimmed">
        {shortlist.layerName}
      </Text>
      {shortlist.criteria.map((criterion) => (
        <div key={criterion}>
          <Text size="xs">
            {criterionLabel(criterion)}: {weights[criterion]}
          </Text>
          <Slider
            size="xs"
            min={0}
            max={sliderMaximum}
            step={WEIGHT_STEP}
            value={weights[criterion]}
            onChange={(value) => setWeights({ ...weights, [criterion]: value })}
            thumbLabel={`${criterionLabel(criterion)} weight`}
          />
        </div>
      ))}
      <ScrollArea h={SHORTLIST_HEIGHT_PX}>
        <Table striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>#</Table.Th>
              <Table.Th>Site</Table.Th>
              <Table.Th>Score</Table.Th>
              {shortlist.criteria.map((criterion) => (
                <Table.Th key={criterion}>{criterionLabel(criterion)}</Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {ranked.map((site) => (
              <Table.Tr key={site.name}>
                <Table.Td>{site.rank}</Table.Td>
                <Table.Td>{site.name}</Table.Td>
                <Table.Td fw={600}>{site.total.toFixed(1)}</Table.Td>
                {shortlist.criteria.map((criterion) => (
                  <Table.Td key={criterion}>{(site.scores[criterion] ?? 0).toFixed(0)}</Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      <Button size="xs" leftSection={<IconFileTypePdf size={14} />} onClick={handleReport}>
        Site report
      </Button>
      {status && (
        <Text size="xs" c="dimmed">
          {status}
        </Text>
      )}
    </Stack>
  );
}

export function SiteWeightsPanel({ comps }: { comps: CompSale[] }) {
  const layers = useAgentLayerStore((s) => s.layers);
  const shortlist = useMemo(() => siteShortlist(layers), [layers]);

  return (
    <Paper p="sm" radius="md" withBorder>
      {shortlist ? (
        // a new layer or new agent weights start the sliders over
        <ShortlistWeights
          key={`${shortlist.layerId} ${JSON.stringify(shortlist.weights)}`}
          shortlist={shortlist}
          comps={comps}
        />
      ) : (
        <Text size="xs" c="dimmed">
          No scored sites yet. Ask the agent to score sites or build trade areas, and the newest
          score_sites or trade_area layer lists here.
        </Text>
      )}
    </Paper>
  );
}
