# GeoLang Industry Verticals

Self-hosted, open-source geospatial solutions for multiple industries.
Each vertical leverages the same underlying platform with specialized panels.

These pages describe integration targets, not complete products. The built-in
plugins read configured datasets or demo data. They do not supply sensor,
incident, fleet, parcel, or industry data. Live feeds require a matching
backend. Panoptes publishes weights for building segmentation only.

## Environmental Monitoring

### Components
- **SensorPanel**: sensor inventory and the last reading from the `sensors` dataset. The plugin declares a `wsUrl` setting but nothing reads it, so there is no live stream
- **WeatherPanel** (existing): current conditions and hourly forecast from open-meteo, optional temperature/precipitation grid overlay
- **FloodPanel** (existing): flood level modelled over terrain
- **HeatmapPanel** (existing): sensor density/intensity visualization
- **TimelinePanel** (existing): Cesium clock playback over time-tagged data

### Backend: fluvius + collecta + terrano + panoptes
- fluvius: automated data pipeline from IoT devices, windowing over the live sensor stream
- collecta: field observation forms, submission ingestion and storage
- terrano: terrain analysis, watershed delineation
- panoptes: imagery feature extraction, ONNX segmentation and pixel-difference change detection (building weights are published, other models are yours to supply)

### Use Cases
- Water quality monitoring (rivers, treatment plants)
- Air quality networks (PM2.5, ozone, NO₂)
- Weather station networks
- Soil moisture / groundwater level

---

## Construction & Civil Engineering

### Components
- **ConstructionPanel**: survey comparison, cut/fill volumes, progress tracking
- **TerrainProfilePanel** (existing): cross-section analysis
- **VolumePanel** (existing): 3D volume calculations
- **CrossSectionPanel** (existing): road/pipeline cross-sections
- **ModelImportPanel** (existing): glTF and GLB models. An IFC file goes to the server through the Assets panel instead
- **MeasurementPanel** (existing): distance, area, elevation

### Backend: tiletopia + nubis + terrano + ptolemy
- tiletopia: 3D Tiles serving for BIM models and point clouds
- nubis: LAS point cloud processing (formats 0 to 3, LAZ is read by tiletopia's ingest crate)
- terrano: terrain models, GeoTIFF
- ptolemy: survey comparison with cut and fill volumes (`POST /surveys/compare`)

### Use Cases
- Earthwork volume tracking (cut/fill)
- Drone survey progress monitoring
- BIM model overlay on site map
- Road/pipeline alignment design
- Construction milestone tracking

---

## Agriculture / Precision Farming

### Components
- **FieldPanel**: crop zones, NDVI health index, soil moisture, growth status
- **RasterPanel** (existing): NDVI and other band math over a loaded GeoTIFF
- **DronePanel** (existing): drone flight planning
- **TimelapsePanel** (existing): crop growth over time
- **SpatialStatsPanel** (existing): yield statistics by zone

### Backend: terrano + fluvius + panoptes + topoi
- terrano: GeoTIFF raster processing (NDVI, thermal)
- fluvius: sensor monitoring (soil moisture, weather stations) over MQTT and Kafka
- panoptes: field feature extraction from imagery, ONNX segmentation and pixel-difference change detection (building weights are published, other models are yours to supply)
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
- **CoveragePanel**: tower inventory, a coverage footprint from each tower's radius or radio horizon, terrain viewshed from a candidate site
- **ViewshedPanel** (existing): line-of-sight analysis
- **TerrainAnalysisPanel** (existing): elevation profiles
- **BuildingsPanel** (existing): 3D building obstruction

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
- **IncidentPanel**: incident reporting, dispatch, evacuation routes, affected area display
- **GeofencePanel** (existing): exclusion zones, perimeters
- **FloodPanel** (existing): flood level modelled over terrain
- **RoutingPanel** (existing): fastest route to incident
- **TrafficPanel** (existing): user-provided traffic tiles or a demo mode over OSM roads (no live global feed without a key)

### Backend: itinera + geokode + ptolemy
- itinera: evacuation route calculation, isochrones
- geokode: address lookup for incident locations
- ptolemy: incident features, read and written over `/incidents`. The panel
  polls, there is no incident WebSocket

### Use Cases
- Fire/flood incident command
- Evacuation route planning
- Search and rescue coordination
- HAZMAT response zones
- Population exposure estimates

---

## Platform Comparison

| Capability | Esri | Mapbox | GeoLang |
|-----------|------|--------|-----------|
| Environmental monitoring | yes | no | partial |
| Construction progress | yes | no | partial |
| Precision agriculture | yes | no | partial |
| Telecom planning | yes | no | partial |
| Emergency management | yes | no | partial |
| Fleet/logistics | yes | yes | partial |
| Real estate | yes | no | partial |
| Self-hosted | no | no | yes |
| No per-seat licensing | no | no | yes |
| Open source | no | partial | yes |
| 3D visualization | yes | yes | yes |

## License

AGPL-3.0-or-later, all verticals included.
