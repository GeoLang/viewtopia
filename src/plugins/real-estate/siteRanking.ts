import type { ShortlistedSite } from '../../features/deals/deal';
import type { AgentLayer } from '../../store/agentLayers';

type SiteProperties = Record<string, unknown>;

export const DEFAULT_WEIGHT = 1;
const SCORE_SUFFIX = '_score';
const WEIGHT_SUFFIX = '_weight';
const TOTAL_SCORE_COLUMN = 'total_score';
const TRADE_AREA_SITE_COLUMN = 'site';
const MAXIMUM_CRITERION_SCORE = 100;
// score_sites gives every site this when their raw values are all equal
const UNDIVIDED_CRITERION_SCORE = 50;
const TRADE_AREA_UNRATED_COLUMNS = new Set([
  TRADE_AREA_SITE_COLUMN,
  'lat',
  'lon',
  'minutes',
  'mode',
  'area_km2',
  'population_source',
]);
const FEWER_IS_BETTER_CRITERIA = new Set(['competitors']);
const TRADE_AREA_LOCATION_COLUMNS = new Set([TRADE_AREA_SITE_COLUMN, 'lat', 'lon']);

export interface ScoredSite {
  name: string;
  scores: Record<string, number>;
}

export interface SiteShortlist {
  layerId: string;
  layerName: string;
  criteria: string[];
  weights: Record<string, number>;
  sites: ScoredSite[];
}

export interface RankedSite extends ScoredSite {
  rank: number;
  total: number;
}

export interface TradeAreaTable {
  columns: string[];
  rows: Array<{ site: string; values: SiteProperties }>;
}

function layerProperties(layer: AgentLayer): SiteProperties[] {
  // shading adds colour keys to the drawn features
  const features = (layer.sourceGeojson ?? layer.geojson).features;
  return features.map((feature) => feature.properties ?? {});
}

function isScoreSitesOutput(properties: SiteProperties): boolean {
  return TOTAL_SCORE_COLUMN in properties && 'rank' in properties;
}

function isTradeAreaOutput(properties: SiteProperties): boolean {
  return TRADE_AREA_SITE_COLUMN in properties && 'population' in properties && 'minutes' in properties;
}

function latestLayer(
  layers: AgentLayer[],
  matches: (properties: SiteProperties) => boolean,
): AgentLayer | null {
  for (let index = layers.length - 1; index >= 0; index--) {
    const first = layerProperties(layers[index])[0];
    if (first && matches(first)) return layers[index];
  }
  return null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function scoreSitesShortlist(layer: AgentLayer): SiteShortlist {
  const rows = layerProperties(layer);
  const criteria = Object.keys(rows[0])
    .filter((column) => column.endsWith(SCORE_SUFFIX) && column !== TOTAL_SCORE_COLUMN)
    .map((column) => column.slice(0, -SCORE_SUFFIX.length));
  const weights = Object.fromEntries(
    criteria.map((criterion) => [
      criterion,
      finiteNumber(rows[0][criterion + WEIGHT_SUFFIX]) ?? DEFAULT_WEIGHT,
    ]),
  );
  const sites = rows.map((row) => ({
    name: String(row.name),
    scores: Object.fromEntries(
      criteria.map((criterion) => [criterion, finiteNumber(row[criterion + SCORE_SUFFIX]) ?? 0]),
    ),
  }));
  return { layerId: layer.id, layerName: layer.name, criteria, weights, sites };
}

function scaledScores(values: number[], fewerIsBetter: boolean): number[] {
  const lowest = Math.min(...values);
  const highest = Math.max(...values);
  if (highest === lowest) return values.map(() => UNDIVIDED_CRITERION_SCORE);
  return values.map((value) => {
    const share = (value - lowest) / (highest - lowest);
    return (fewerIsBetter ? 1 - share : share) * MAXIMUM_CRITERION_SCORE;
  });
}

function tradeAreaShortlist(layer: AgentLayer): SiteShortlist {
  const rows = layerProperties(layer);
  // a figure missing for any site cannot rank them
  const criteria = Object.keys(rows[0]).filter(
    (column) =>
      !TRADE_AREA_UNRATED_COLUMNS.has(column) &&
      rows.every((row) => finiteNumber(row[column]) !== null),
  );
  const scoresByCriterion = Object.fromEntries(
    criteria.map((criterion) => [
      criterion,
      scaledScores(
        rows.map((row) => row[criterion] as number),
        FEWER_IS_BETTER_CRITERIA.has(criterion),
      ),
    ]),
  );
  const sites = rows.map((row, index) => ({
    name: String(row[TRADE_AREA_SITE_COLUMN]),
    scores: Object.fromEntries(
      criteria.map((criterion) => [criterion, scoresByCriterion[criterion][index]]),
    ),
  }));
  const weights = Object.fromEntries(criteria.map((criterion) => [criterion, DEFAULT_WEIGHT]));
  return { layerId: layer.id, layerName: layer.name, criteria, weights, sites };
}

export function siteShortlist(layers: AgentLayer[]): SiteShortlist | null {
  const layer = latestLayer(
    layers,
    (properties) => isScoreSitesOutput(properties) || isTradeAreaOutput(properties),
  );
  if (!layer) return null;
  return isScoreSitesOutput(layerProperties(layer)[0])
    ? scoreSitesShortlist(layer)
    : tradeAreaShortlist(layer);
}

export function tradeAreaTable(layers: AgentLayer[]): TradeAreaTable | null {
  const layer = latestLayer(layers, isTradeAreaOutput);
  if (!layer) return null;
  const rows = layerProperties(layer);
  return {
    columns: Object.keys(rows[0]).filter((column) => !TRADE_AREA_LOCATION_COLUMNS.has(column)),
    rows: rows.map((values) => ({ site: String(values[TRADE_AREA_SITE_COLUMN]), values })),
  };
}

export function rankSites(
  sites: ScoredSite[],
  weights: Record<string, number>,
): RankedSite[] {
  const criteria = Object.keys(weights);
  const totalWeight = criteria.reduce((sum, criterion) => sum + weights[criterion], 0);
  return sites
    .map((site) => {
      const weighted = criteria.reduce(
        (sum, criterion) => sum + (site.scores[criterion] ?? 0) * weights[criterion],
        0,
      );
      return { ...site, total: totalWeight > 0 ? weighted / totalWeight : 0 };
    })
    .sort((first, second) => second.total - first.total)
    .map((site, index) => ({ ...site, rank: index + 1 }));
}

export interface DealSiteScores {
  sites: ScoredSite[];
  unscored: ShortlistedSite[];
}

function siteKey(name: string): string {
  return name.trim().toLowerCase();
}

// the tool rows carry no feature id, so a deal site matches the row named like its label
export function dealSiteScores(scored: ScoredSite[], dealSites: ShortlistedSite[]): DealSiteScores {
  const byName = new Map(scored.map((site) => [siteKey(site.name), site]));
  const sites: ScoredSite[] = [];
  const unscored: ShortlistedSite[] = [];
  for (const dealSite of dealSites) {
    const match = byName.get(siteKey(dealSite.label));
    if (match) sites.push(match);
    else unscored.push(dealSite);
  }
  return { sites, unscored };
}

export function criterionLabel(criterion: string): string {
  return criterion.replaceAll('_', ' ');
}
