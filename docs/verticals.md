# TileTopia Industry Verticals

Self-hosted, open-source geospatial solutions for multiple industries.
Each vertical leverages the same underlying platform with specialized panels.

## Environmental Monitoring

### Components
- **SensorPanel** — live sensor readings (temperature, humidity, air quality, water level) via WebSocket
- **WeatherPanel** (existing) — weather overlay
- **FloodPanel** (existing) — flood zone analysis
- **HeatmapPanel** (existing) — sensor density/intensity visualization
- **TimelinePanel** (existing) — temporal playback of sensor history

### Backend: panoptes + terrano + fluvius
- panoptes: observation management, time-series storage
- terrano: terrain analysis, watershed delineation
- fluvius: automated data pipeline from IoT devices

### Configuration
```env
VITE_SENSOR_WS_URL=ws://localhost:3004/ws/sensors
```

### Use Cases
- Water quality monitoring (rivers, treatment plants)
- Air quality networks (PM2.5, ozone, NO₂)
- Weather station networks
- Soil moisture / groundwater level

---

## Construction & Civil Engineering

### Components
- **ConstructionPanel** — survey comparison, cut/fill volumes, progress tracking
- **TerrainProfilePanel** (existing) — cross-section analysis
- **VolumePanel** (existing) — 3D volume calculations
- **CrossSectionPanel** (existing) — road/pipeline cross-sections
- **ModelImportPanel** (existing) — BIM/IFC import
- **PointCloudComparePanel** (existing) — drone survey comparison
- **MeasurementPanel** (existing) — distance, area, elevation

### Backend: tiletopia + nubis + terrano
- tiletopia: 3D Tiles serving for BIM models and point clouds
- nubis: LAS/LAZ point cloud processing
- terrano: terrain models, GeoTIFF, cut/fill calculations

### Use Cases
- Earthwork volume tracking (cut/fill)
- Drone survey progress monitoring
- BIM model overlay on site map
- Road/pipeline alignment design
- Construction milestone tracking

---

## Agriculture / Precision Farming

### Components
- **FieldPanel** — crop zones, NDVI health index, soil moisture, growth status
- **RasterViewerPanel** (existing) — NDVI/multispectral imagery
- **DronePanel** (existing) — drone flight planning
- **TimelapsePanel** (existing) — crop growth over time
- **SpatialStatsPanel** (existing) — yield statistics by zone

### Backend: terrano + panoptes + topoi
- terrano: GeoTIFF raster processing (NDVI, thermal)
- panoptes: sensor monitoring (soil moisture, weather stations)
- topoi: field boundary management, zone operations

### Use Cases
- Crop health monitoring (NDVI from satellite/drone)
- Variable-rate application planning
- Yield mapping and analysis
- Irrigation zone management
- Pest/disease detection zones

---

## Telecom / Network Planning

### Components
- **CoveragePanel** — tower inventory, signal simulation, site planning
- **ViewshedPanel** (existing) — line-of-sight analysis
- **TerrainAnalysisPanel** (existing) — elevation profiles
- **BuildingsPanel** (existing) — 3D building obstruction

### Backend: terrano + topoi
- terrano: terrain elevation models for propagation modeling
- topoi: coverage polygon generation, intersection analysis

### Use Cases
- Cell tower site selection
- Coverage gap analysis
- RF propagation simulation (viewshed-based)
- Network capacity planning
- Small cell densification planning

---

## Emergency Management / SAR

### Components
- **IncidentPanel** — incident reporting, dispatch, evacuation routes, affected area display
- **GeofencePanel** (existing) — exclusion zones, perimeters
- **FloodPanel** (existing) — flood inundation
- **RoutingPanel** (existing) — fastest route to incident
- **TrafficPanel** (existing) — road blockages

### Backend: itinera + geokode + ptolemy
- itinera: evacuation route calculation, isochrones
- geokode: address lookup for incident locations
- ptolemy: real-time incident data, WebSocket updates

### Use Cases
- Fire/flood incident command
- Evacuation route planning
- Search and rescue coordination
- HAZMAT response zones
- Population exposure estimates

---

## Platform Comparison

| Capability | Esri | Mapbox | TileTopia |
|-----------|------|--------|-----------|
| Environmental monitoring | ✅ | ❌ | ✅ |
| Construction progress | ✅ | ❌ | ✅ |
| Precision agriculture | ✅ | ❌ | ✅ |
| Telecom planning | ✅ | ❌ | ✅ |
| Emergency management | ✅ | ❌ | ✅ |
| Fleet/logistics | ✅ | ✅ | ✅ |
| Real estate | ✅ | ❌ | ✅ |
| Self-hosted | ❌ | ❌ | ✅ |
| No per-seat licensing | ❌ | ❌ | ✅ |
| Open source | ❌ | partial | ✅ |
| 3D visualization | ✅ | ✅ | ✅ |

## License

AGPL-3.0-or-later — all verticals included.
