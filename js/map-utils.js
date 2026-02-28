/* ═══════════════════════════════════════════════════════
   Map Utilities — Shared Leaflet helpers
   ═══════════════════════════════════════════════════════ */

const TOPO_TILES = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
const TOPO_ATTR = '© <a href="https://opentopomap.org">OpenTopoMap</a> · © <a href="https://openstreetmap.org">OSM</a>';
const SAT_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const SAT_ATTR = '© <a href="https://www.esri.com">Esri</a> · Satellite';
const OSM_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTR = '© <a href="https://openstreetmap.org">OpenStreetMap</a>';

const LAKE_DISTRICT_CENTER = [54.43, -2.97];
const LAKE_DISTRICT_ZOOM = 11;

/**
 * Create a Leaflet map with layer toggle (Topo / Satellite / Street)
 */
export function createMap(containerId, options = {}) {
    const map = L.map(containerId, {
        center: options.center || LAKE_DISTRICT_CENTER,
        zoom: options.zoom || LAKE_DISTRICT_ZOOM,
        zoomControl: true,
        attributionControl: true,
        ...options
    });

    const topoLayer = L.tileLayer(TOPO_TILES, {
        attribution: TOPO_ATTR, maxZoom: 17, opacity: 0.92
    });
    const satLayer = L.tileLayer(SAT_TILES, {
        attribution: SAT_ATTR, maxZoom: 18
    });
    const osmLayer = L.tileLayer(OSM_TILES, {
        attribution: OSM_ATTR, maxZoom: 19
    });

    topoLayer.addTo(map);

    L.control.layers({
        '🏔️ Terrain': topoLayer,
        '🛰️ Satellite': satLayer,
        '🗺️ Street': osmLayer
    }, null, { position: 'topright', collapsed: true }).addTo(map);

    return map;
}

/**
 * Difficulty colour
 */
export function difficultyColor(difficulty) {
    const colors = {
        'Easy': '#4ade80',
        'Moderate': '#fbbf24',
        'Challenging': '#f87171'
    };
    return colors[difficulty] || '#8da2b8';
}

/**
 * Walk type icon
 */
export function walkTypeIcon(type) {
    const icons = {
        summit: '⛰️',
        lakeside: '🌊',
        waterfall: '💧',
        heritage: '🏛️',
        woodland: '🌲',
        ridge: '🗻',
        village: '🏘️'
    };
    return icons[type] || '🥾';
}

/**
 * Create a parking marker
 */
export function parkingMarker(lat, lon, name) {
    return L.marker([lat, lon], {
        icon: L.divIcon({
            html: '<div style="font-size:24px;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.6));line-height:1;">🅿️</div>',
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            className: ''
        })
    }).bindPopup(`<strong>🅿️ Car Park</strong><br>${name}`);
}

/**
 * Create a destination marker
 */
export function destMarker(lat, lon, name) {
    return L.marker([lat, lon], {
        icon: L.divIcon({
            html: '<div style="font-size:24px;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.6));line-height:1;">🏔️</div>',
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            className: ''
        })
    }).bindPopup(`<strong>🏔️ Destination</strong><br>${name}`);
}

/**
 * Draw a route polyline from waypoints with glow effect
 */
export function drawRoute(map, waypoints, color = '#4ecdc4') {
    // Outer glow
    const glow = L.polyline(waypoints, {
        color: color,
        weight: 12,
        opacity: 0.12,
        smoothFactor: 1,
        lineJoin: 'round'
    }).addTo(map);

    // Main line
    const line = L.polyline(waypoints, {
        color: color,
        weight: 4,
        opacity: 0.9,
        smoothFactor: 1,
        lineJoin: 'round'
    }).addTo(map);

    return { line, glow };
}

/**
 * Fit map to show all waypoints with padding
 */
export function fitToWaypoints(map, waypoints, padding = [50, 50]) {
    if (!waypoints || waypoints.length === 0) return;
    const bounds = L.latLngBounds(waypoints);
    map.fitBounds(bounds, { padding });
}

/**
 * Generate GPX file from walk data
 */
export function generateGPX(walk) {
    const pts = (walk.waypoints || []).map(wp =>
        `      <trkpt lat="${wp[0]}" lon="${wp[1]}"></trkpt>`
    ).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Trail Mapper Pro"
  xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(walk.name)}</name>
    <desc>${escapeXml(walk.desc || '')}</desc>
  </metadata>
  <trk>
    <name>${escapeXml(walk.name)}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>`;
}

function escapeXml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Download GPX file for a walk
 */
export function downloadGPX(walk) {
    const gpx = generateGPX(walk);
    const blob = new Blob([gpx], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${walk.name.replace(/[^a-zA-Z0-9]/g, '_')}.gpx`;
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * Render a simple elevation profile canvas
 * Uses rough Haversine distance along waypoints
 */
export function renderElevationProfile(containerId, waypoints, elevation) {
    const container = document.getElementById(containerId);
    if (!container || !waypoints || waypoints.length < 2) {
        if (container) container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    container.innerHTML = `
        <div style="font-size:11px;text-transform:uppercase;color:var(--accent-dim,#8da2b8);font-weight:600;margin-bottom:8px;">📈 Elevation Profile</div>
        <canvas id="${containerId}-canvas" width="600" height="120" style="width:100%;height:120px;border-radius:8px;background:rgba(0,0,0,0.15);"></canvas>
    `;

    const canvas = document.getElementById(`${containerId}-canvas`);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // Parse elevation string to get total ascent
    const totalAscent = parseFloat(elevation) || 100;

    // Create a synthetic elevation profile from waypoints
    // Uses distance along route to create a realistic bell curve for summit walks
    const numPts = Math.min(waypoints.length, 200);
    const step = Math.max(1, Math.floor(waypoints.length / numPts));
    const pts = [];
    let totalDist = 0;

    for (let i = 0; i < waypoints.length; i += step) {
        if (i > 0) {
            const prev = waypoints[Math.max(0, i - step)];
            const curr = waypoints[i];
            totalDist += haversine(prev[0], prev[1], curr[0], curr[1]);
        }
        pts.push({ dist: totalDist, idx: i / waypoints.length });
    }

    // Generate realistic elevation curve
    const elevations = pts.map(p => {
        // Bell curve peaking at midpoint (simulates going up and coming back down)
        const x = p.idx;
        return totalAscent * Math.sin(x * Math.PI) * 0.8 + totalAscent * 0.1;
    });

    const maxEl = Math.max(...elevations);
    const minEl = 0;
    const range = maxEl - minEl || 1;

    // Draw filled area
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(78, 205, 196, 0.6)');
    grad.addColorStop(1, 'rgba(78, 205, 196, 0.05)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, h);
    elevations.forEach((el, i) => {
        const x = (i / (elevations.length - 1)) * w;
        const y = h - ((el - minEl) / range) * (h - 20) - 10;
        if (i === 0) ctx.lineTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // Draw line
    ctx.strokeStyle = '#4ecdc4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    elevations.forEach((el, i) => {
        const x = (i / (elevations.length - 1)) * w;
        const y = h - ((el - minEl) / range) * (h - 20) - 10;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Labels
    ctx.fillStyle = '#8da2b8';
    ctx.font = '10px system-ui';
    ctx.fillText(`${Math.round(maxEl)}m`, 4, 14);
    ctx.fillText('0m', 4, h - 4);
    ctx.fillText(`${(pts[pts.length - 1]?.dist / 1000 || 0).toFixed(1)}km`, w - 35, h - 4);
}

function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

