export interface ServiceConfig {
  name: string;
  id: string;
  healthUrl: string;
  port: number;
  description: string;
  composeName: string;
}

export const SERVICES: ServiceConfig[] = [
  {
    name: "PostGIS",
    id: "db",
    healthUrl: "", // checked via API route (pg_isready)
    port: 5432,
    description: "Spatial database (PostGIS 16)",
    composeName: "db",
  },
  {
    name: "Ptolemy",
    id: "ptolemy",
    healthUrl: "http://localhost:3000/api/v1/health",
    port: 3000,
    description: "Enterprise geodatabase & geoprocessing API",
    composeName: "ptolemy",
  },
  {
    name: "TileTopia",
    id: "tiletopia",
    healthUrl: "http://localhost:3100/api/v1/health",
    port: 3100,
    description: "3D Tiles, terrain, and asset server",
    composeName: "tiletopia",
  },
  {
    name: "Fenestra",
    id: "fenestra",
    healthUrl: "http://localhost:3003/health",
    port: 3003,
    description: "OGC WMS/WFS/WMTS gateway with server-side rendering",
    composeName: "fenestra",
  },
  {
    name: "Geokode",
    id: "geokode",
    healthUrl: "http://localhost:3001/health",
    port: 3001,
    description: "Geocoding service",
    composeName: "geokode",
  },
  {
    name: "Itinera",
    id: "itinera",
    healthUrl: "http://localhost:3002/health",
    port: 3002,
    description: "Routing & isochrones",
    composeName: "itinera",
  },
  {
    name: "GeoLang AI",
    id: "geolang",
    healthUrl: "http://localhost:8080/health",
    port: 8080,
    description: "AI/NLP geospatial agent",
    composeName: "geolang",
  },
  {
    name: "Letta",
    id: "letta",
    healthUrl: "http://localhost:8283/health",
    port: 8283,
    description: "Agent memory server",
    composeName: "letta",
  },
  {
    name: "ViewTopia",
    id: "viewtopia",
    healthUrl: "http://localhost:5174",
    port: 5174,
    description: "Frontend viewer & A2UI",
    composeName: "viewtopia",
  },
];

// Docker Compose file path (relative to viewtopia root)
export const COMPOSE_FILE = "docker-compose.platform.yml";
export const COMPOSE_DIR = process.env.COMPOSE_DIR || "/home/aaron/src/GeoLang/viewtopia";
