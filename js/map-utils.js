// Tile sources
const TOPO_TILES = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
const TOPO_ATTR = '© <a href="https://opentopomap.org">OpenTopoMap</a> · © <a href="https://openstreetmap.org">OSM</a>';
const OSM_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTR = '© <a href="https://openstreetmap.org">OpenStreetMap</a>';

const LAKE_DISTRICT_CENTER = [54.43, -2.97];
const LAKE_DISTRICT_ZOOM = 11;

// Track Google Maps API loading state
let googleMapsLoaded = false;
let googleMapsLoading = false;

/**
 * Get Google Maps API Key
 */
function getGoogleMapsKey() {
    return localStorage.getItem('google_maps_key') ||
        (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_MAPS_KEY) || '';
}

/**
 * Set Google Maps API Key (localStorage override)
 */
export function setGoogleMapsKey(key) {
    localStorage.setItem('google_maps_key', key);
}

/**
 * Load Google Maps JS API dynamically
 */
function loadGoogleMapsAPI() {
    return new Promise((resolve, reject) => {
        if (googleMapsLoaded) { resolve(); return; }
        if (window.google && window.google.maps) { googleMapsLoaded = true; resolve(); return; }

        const key = getGoogleMapsKey();
        if (!key) { reject(new Error('No Google Maps API key')); return; }

        if (googleMapsLoading) {
            const check = setInterval(() => {
                if (window.google && window.google.maps) {
                    clearInterval(check);
                    googleMapsLoaded = true;
                    resolve();
                }
            }, 100);
            setTimeout(() => { clearInterval(check); reject(new Error('Google Maps API load timeout')); }, 10000);
            return;
        }

        googleMapsLoading = true;
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&v=weekly`;
        script.async = true;
        script.defer = true;
        script.onload = () => { googleMapsLoaded = true; googleMapsLoading = false; resolve(); };
        script.onerror = () => { googleMapsLoading = false; reject(new Error('Failed to load Google Maps API')); };
        document.head.appendChild(script);
    });
}

/**
 * Create a Leaflet map.
 * Default layer: OpenTopoMap terrain (Leaflet tiles).
 * Google layers (Satellite, Hybrid, Roadmap) available if API key is set.
 */
export function createMap(containerId, options = {}) {
    const map = L.map(containerId, {
        center: options.center || LAKE_DISTRICT_CENTER,
        zoom: options.zoom || LAKE_DISTRICT_ZOOM,
        zoomControl: true,
        attributionControl: true,
        ...options
    });

    // Leaflet OpenTopoMap — always the default terrain layer
    const topoLayer = L.tileLayer(TOPO_TILES, {
        attribution: TOPO_ATTR, maxZoom: 17, opacity: 0.92
    });
    topoLayer.addTo(map);

    // Build layer control options starting with terrain
    const baseLayers = { '🏔️ Terrain': topoLayer };

    // Try adding Google layers
    const key = getGoogleMapsKey();
    if (key && window.google && window.google.maps) {
        _addGoogleLayers(map, baseLayers);
    } else if (key) {
        loadGoogleMapsAPI().then(() => {
            _addGoogleLayers(map, baseLayers);
        }).catch(() => {
            console.warn('Google Maps API unavailable — terrain-only mode');
        });
    }

    // Layer control (Terrain always present; Google layers added async if available)
    const layerControl = L.control.layers(baseLayers, null, { position: 'topright', collapsed: true });
    layerControl.addTo(map);
    map._layerControl = layerControl;

    // Toggle Leaflet watermark based on active layer
    map.on('baselayerchange', (e) => {
        const isLeafletLayer = (e.name === '🏔️ Terrain');
        const watermark = map.getContainer().querySelector('.leaflet-control-attribution');
        if (watermark) {
            watermark.style.opacity = isLeafletLayer ? '1' : '0';
        }
    });

    return map;
}

/**
 * Add Google Satellite/Hybrid/Roadmap to the layer control
 */
function _addGoogleLayers(map, baseLayers) {
    try {
        const satellite = L.gridLayer.googleMutant({ type: 'satellite', maxZoom: 20 });
        const hybrid = L.gridLayer.googleMutant({ type: 'hybrid', maxZoom: 20 });
        const roadmap = L.gridLayer.googleMutant({ type: 'roadmap', maxZoom: 20 });

        baseLayers['🛰️ Satellite'] = satellite;
        baseLayers['🗺️ Hybrid'] = hybrid;
        baseLayers['📍 Roadmap'] = roadmap;

        // Update layer control if it already exists
        if (map._layerControl) {
            map._layerControl.addBaseLayer(satellite, '🛰️ Satellite');
            map._layerControl.addBaseLayer(hybrid, '🗺️ Hybrid');
            map._layerControl.addBaseLayer(roadmap, '📍 Roadmap');
        }
    } catch (err) {
        console.warn('GoogleMutant failed:', err.message);
    }
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
 * Create a destination/POI marker with walk-type-specific icon
 */
export function destMarker(lat, lon, name, walkType) {
    const icons = {
        summit: '⛰️',
        lakeside: '🌊',
        waterfall: '💧',
        heritage: '🏛️',
        woodland: '🌲',
        ridge: '🗻',
        village: '🏘️'
    };
    const icon = icons[walkType] || '📍';
    const label = walkType ? walkType.charAt(0).toUpperCase() + walkType.slice(1) : 'Destination';

    return L.marker([lat, lon], {
        icon: L.divIcon({
            html: `<div style="font-size:26px;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.7));line-height:1;">${icon}</div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            className: ''
        })
    }).bindPopup(`<strong>${icon} ${label}</strong><br>${name}`);
}

/**
 * Draw a route polyline from waypoints with glow effect
 */
export function drawRoute(map, waypoints, color = '#f0a830') {
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
 * Render a crisp, HiDPI-aware elevation profile canvas
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
        <div class="elevation-label">📈 Elevation Profile</div>
        <canvas id="${containerId}-canvas" class="elevation-canvas"></canvas>
    `;

    const canvas = document.getElementById(`${containerId}-canvas`);
    if (!canvas) return;

    // HiDPI-aware sizing: match bitmap to actual display pixels
    const dpr = window.devicePixelRatio || 1;
    const displayW = container.clientWidth;
    const displayH = 140;
    canvas.width = Math.round(displayW * dpr);
    canvas.height = Math.round(displayH * dpr);
    canvas.style.width = displayW + 'px';
    canvas.style.height = displayH + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // Now draw in CSS-pixel coordinates (displayW × displayH)
    const w = displayW;
    const h = displayH;
    const padLeft = 44;
    const padRight = 12;
    const padTop = 18;
    const padBottom = 24;
    const chartW = w - padLeft - padRight;
    const chartH = h - padTop - padBottom;

    // Parse elevation string to get total ascent
    const totalAscent = parseFloat(elevation) || 100;

    // Create a synthetic elevation profile from waypoints
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
        const x = p.idx;
        return totalAscent * Math.sin(x * Math.PI) * 0.8 + totalAscent * 0.1;
    });

    const maxEl = Math.max(...elevations);
    const minEl = 0;
    const range = maxEl - minEl || 1;

    // Helper: data → pixel coords
    const toX = (i) => padLeft + (i / (elevations.length - 1)) * chartW;
    const toY = (el) => padTop + chartH - ((el - minEl) / range) * chartH;

    // Draw subtle horizontal grid lines
    ctx.strokeStyle = 'rgba(141, 162, 184, 0.08)';
    ctx.lineWidth = 1;
    for (let g = 0; g <= 4; g++) {
        const gy = padTop + (g / 4) * chartH;
        ctx.beginPath();
        ctx.moveTo(padLeft, gy);
        ctx.lineTo(padLeft + chartW, gy);
        ctx.stroke();
    }

    // Draw filled area
    const grad = ctx.createLinearGradient(0, padTop, 0, padTop + chartH);
    grad.addColorStop(0, 'rgba(240, 168, 48, 0.5)');
    grad.addColorStop(1, 'rgba(240, 168, 48, 0.02)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(toX(0), padTop + chartH);
    elevations.forEach((el, i) => ctx.lineTo(toX(i), toY(el)));
    ctx.lineTo(toX(elevations.length - 1), padTop + chartH);
    ctx.closePath();
    ctx.fill();

    // Draw profile line
    ctx.strokeStyle = '#f0a830';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    elevations.forEach((el, i) => {
        if (i === 0) ctx.moveTo(toX(i), toY(el));
        else ctx.lineTo(toX(i), toY(el));
    });
    ctx.stroke();

    // Axis labels (crisp, properly sized)
    ctx.fillStyle = '#8da2b8';
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(maxEl)}m`, padLeft - 6, padTop);
    ctx.fillText(`${Math.round(maxEl / 2)}m`, padLeft - 6, padTop + chartH / 2);
    ctx.fillText('0m', padLeft - 6, padTop + chartH);

    // Distance label
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(`${(pts[pts.length - 1]?.dist / 1000 || 0).toFixed(1)} km`, padLeft + chartW, padTop + chartH + 6);

    ctx.textAlign = 'left';
    ctx.fillText('0 km', padLeft, padTop + chartH + 6);
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

