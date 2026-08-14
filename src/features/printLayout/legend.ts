import { type AgentLayer, layerColor, visibleLayers } from '../../store/agentLayers';
import { legendEntries, symbologyField } from '../symbology/symbology';
import type { LegendGroup } from './page';

const SINGLE_COLOUR_LABEL = 'single colour';

/** The legend panel's swatches, grouped for the page: one group per visible layer. */
export function legendGroups(layers: AgentLayer[]): LegendGroup[] {
  return visibleLayers(layers).map((layer) => {
    const symbology = layer.symbology;
    const field = symbology && symbologyField(symbology);
    return {
      name: field ? `${layer.name} by ${field}` : layer.name,
      entries: symbology
        ? legendEntries(symbology)
        : [{ color: layerColor(layer), label: SINGLE_COLOUR_LABEL }],
    };
  });
}
