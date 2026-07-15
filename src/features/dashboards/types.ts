export type WidgetType = 'map' | 'chart' | 'indicator' | 'list' | 'gauge' | 'richtext';

export type ChartType = 'bar' | 'line' | 'pie';

export interface ChartDatum {
  label: string;
  value: number;
}

export interface WidgetLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  config: Record<string, unknown>;
  layout: WidgetLayout;
}

export interface Dashboard {
  id: string;
  title: string;
  description: string;
  widgets: DashboardWidget[];
  theme: { background: string; accent: string };
  created: string;
  modified: string;
}
