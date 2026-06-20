/**
 * GARUDA Frontend — Leaflet Heatmap
 * ====================================
 * Renders violation heatmap over Bangalore using Leaflet + leaflet.heat
 */

const GarudaMap = (() => {
  let map = null;
  let heatLayer = null;
  let markerLayer = null;

  const BANGALORE_CENTER = [12.9716, 77.5946];
  const INITIAL_ZOOM     = 12;

  function init(containerId = 'leaflet-map') {
    if (map) { map.remove(); map = null; }

    map = L.map(containerId, {
      center: BANGALORE_CENTER,
      zoom: INITIAL_ZOOM,
      zoomControl: true,
    });

    // Dark tile layer (Carto Dark Matter)
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 19,
      }
    ).addTo(map);

    markerLayer = L.layerGroup().addTo(map);
  }

  function loadHeatmap(points) {
    // points: [{lat, lon, intensity, camera_id, location}]
    if (!map) return;

    // Remove old heat layer
    if (heatLayer) { map.removeLayer(heatLayer); heatLayer = null; }
    markerLayer.clearLayers();

    if (!points || !points.length) return;

    // Heat data: [lat, lng, intensity]
    const max_intensity = Math.max(...points.map(p => p.intensity), 1);
    const heatData = points.map(p => [p.lat, p.lon, p.intensity / max_intensity]);

    heatLayer = L.heatLayer(heatData, {
      radius: 35,
      blur: 20,
      maxZoom: 17,
      gradient: {
        0.0: '#001f44',
        0.3: '#003d8f',
        0.5: '#0066ff',
        0.7: '#ff6600',
        0.9: '#ff0000',
        1.0: '#ff0044',
      },
    }).addTo(map);

    // Add camera markers
    points.forEach(p => {
      if (!p.lat || !p.lon) return;

      const marker = L.circleMarker([p.lat, p.lon], {
        radius: 6,
        fillColor: _intensityColor(p.intensity, max_intensity),
        color: '#fff',
        weight: 1,
        opacity: 1,
        fillOpacity: 0.9,
      });

      marker.bindPopup(`
        <div style="font-family:Inter,sans-serif;min-width:180px">
          <div style="font-weight:700;margin-bottom:4px">${p.location || p.camera_id}</div>
          <div style="color:#999;font-size:12px">${p.camera_id}</div>
          <div style="margin-top:8px;font-size:13px">
            <span style="color:#f44336;font-weight:700">${p.intensity}</span> violations
          </div>
        </div>
      `);

      marker.addTo(markerLayer);
    });

    // Fit map to points
    if (points.length > 0) {
      const bounds = L.latLngBounds(points.map(p => [p.lat, p.lon]));
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }

  function _intensityColor(val, max) {
    const ratio = val / max;
    if (ratio > 0.8) return '#ff0044';
    if (ratio > 0.6) return '#ff6600';
    if (ratio > 0.4) return '#ffaa00';
    if (ratio > 0.2) return '#0066ff';
    return '#00aaff';
  }

  function addViolationPin(lat, lon, violationType, cameraId) {
    if (!map || !lat || !lon) return;
    const marker = L.circleMarker([lat, lon], {
      radius: 8,
      fillColor: '#ff0044',
      color: '#ff6699',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.85,
    });
    marker.bindPopup(`<b>${violationType.replace(/_/g, ' ')}</b><br>${cameraId}`);
    marker.addTo(markerLayer);
    setTimeout(() => { try { markerLayer.removeLayer(marker); } catch {} }, 30000);
  }

  return { init, loadHeatmap, addViolationPin };
})();
