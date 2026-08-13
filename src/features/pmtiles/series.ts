import type { PmtilesInfo } from './source';

/** One archive of a series: the same layer at one point in time. */
export interface PmtilesArchive {
  id: string;
  /** File name or last URL segment, shown in the list. */
  name: string;
  /** Style-facing url, already pmtiles://. */
  url: string;
  /** YYYY, YYYY-MM or YYYY-MM-DD; empty when nothing was found and nobody typed one. */
  timeLabel: string;
  info: PmtilesInfo;
}

const MONTHS_PER_YEAR = 12;
const MAX_DAY_OF_MONTH = 31;

// a date anywhere in the name, but never part of a longer run of digits
const TIME_IN_NAME = /(?<!\d)(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?(?!\d)/;

function basename(source: string): string {
  const withoutQuery = source.split(/[?#]/)[0];
  return withoutQuery.split('/').pop() ?? '';
}

/** Read a time out of a file name or URL. Empty string when there is none. */
export function parseTimeLabel(source: string): string {
  const match = basename(source).match(TIME_IN_NAME);
  if (!match) return '';
  const [, year, month, day] = match;
  const monthNumber = Number(month);
  if (!month || monthNumber < 1 || monthNumber > MONTHS_PER_YEAR) return year;
  const dayNumber = Number(day);
  if (!day || dayNumber < 1 || dayNumber > MAX_DAY_OF_MONTH) return `${year}-${month}`;
  return `${year}-${month}-${day}`;
}

/**
 * Oldest first. Labels sort as text, which is what YYYY-MM-DD is for, and the
 * ones nobody has labelled yet wait at the end in the order they were added.
 */
export function orderedArchives(archives: PmtilesArchive[]): PmtilesArchive[] {
  return [...archives].sort((a, b) => {
    if (!a.timeLabel || !b.timeLabel) return (a.timeLabel ? 0 : 1) - (b.timeLabel ? 0 : 1);
    if (a.timeLabel === b.timeLabel) return 0;
    return a.timeLabel < b.timeLabel ? -1 : 1;
  });
}

let counter = 0;

/** `source` is the file name or the URL the archive came from: the time is read out of it. */
export function makeArchive(source: string, url: string, info: PmtilesInfo): PmtilesArchive {
  counter += 1;
  return {
    id: `pmtiles-series-${counter}`,
    name: basename(source) || source,
    url,
    timeLabel: parseTimeLabel(source),
    info,
  };
}
