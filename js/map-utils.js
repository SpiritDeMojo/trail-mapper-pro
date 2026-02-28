/* ═══════════════════════════════════════════════════════
   Map Utilities — Shared Leaflet helpers
   ═══════════════════════════════════════════════════════ */

const TOPO_TILES = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
const TOPO_ATTR = '© <a href="https://opentopomap.org">OpenTopoMap</a> · © <a href="https://openstreetmap.org">OSM</a>';

const LAKE_DISTRICT_CENTER = [54.43, -2.97];
const LAKE_DISTRICT_ZOOM = 11;

/**
 * Create a Leaflet map with OpenTopoMap tiles
 */
export function createMap(containerId, options = {}) {
    const map = L.map(containerId, {
        center: options.center || LAKE_DISTRICT_CENTER,
        zoom: options.zoom || LAKE_DISTRICT_ZOOM,
        zoomControl: true,
        attributionControl: true,
        ...options
    });

    L.tileLayer(TOPO_TILES, {
        attribution: TOPO_ATTR,
        maxZoom: 17,
        opacity: 0.92
    }).addTo(map);

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
