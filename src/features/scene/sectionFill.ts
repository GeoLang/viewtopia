export interface SectionFillStyle {
  fill: string;
  line: string;
  width: number;
}

const DEFAULT_SECTION_FILL: SectionFillStyle = { fill: '#5c5f66', line: '#3a3d42', width: 1 };

const SECTION_FILLS: { pattern: RegExp; style: SectionFillStyle }[] = [
  { pattern: /CURTAIN|PLATE|MEMBER/, style: { fill: '#d5dee6', line: '#5c6b76', width: 1 } },
  { pattern: /WINDOW/, style: { fill: '#c5e4f2', line: '#2a6d8c', width: 1 } },
  { pattern: /DOOR/, style: { fill: '#e4c89a', line: '#6a4a28', width: 2 } },
  { pattern: /COLUMN/, style: { fill: '#8e9086', line: '#2c2e28', width: 3 } },
  { pattern: /SLAB/, style: { fill: '#b7c0c8', line: '#3e4850', width: 2 } },
  { pattern: /ROOF/, style: { fill: '#c4a484', line: '#5a3c22', width: 2 } },
  { pattern: /WALL/, style: { fill: '#d9d3c7', line: '#3a342c', width: 2 } },
];

export function sectionFillStyle(ifcClass: string | null | undefined): SectionFillStyle {
  if (!ifcClass) return DEFAULT_SECTION_FILL;
  const upper = ifcClass.toUpperCase();
  const found = SECTION_FILLS.find(({ pattern }) => pattern.test(upper));
  return found ? found.style : DEFAULT_SECTION_FILL;
}
