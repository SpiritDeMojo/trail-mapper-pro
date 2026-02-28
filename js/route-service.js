/* ═══════════════════════════════════════════════════════
   Route Service — OpenRouteService foot-hiking API
   ═══════════════════════════════════════════════════════ */

const PROXY_ENDPOINT = '/api/ors';
const DIRECT_ENDPOINT = 'https://api.openrouteservice.org/v2/directions/foot-hiking/geojson';

/**
 * Get ORS API key — checks localStorage first, then Vite env var for local dev
 */
export function getORSKey() {
    return localStorage.getItem('ors_api_key') || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ORS_KEY) || '';
}

/**
 * Set ORS API key (localStorage override)
 */
export function setORSKey(key) {
    localStorage.setItem('ors_api_key', key);
}

/**
 * Make an ORS API request — tries proxy (production), falls back to direct (local dev)
 */
async function callORS(requestBody) {
    // Try serverless proxy first
    try {
        const proxyRes = await fetch(PROXY_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (proxyRes.ok) {
            return await proxyRes.json();
        }

        // Proxy failed — fall through to direct call
    } catch (err) {
        // Network error (proxy doesn't exist in local dev) — fall through
    }

    // Direct API call with local key
    const localKey = getORSKey();
    if (!localKey) {
        throw new Error('No ORS API key available. Add one in Settings or set VITE_ORS_KEY in .env.local');
    }

    const response = await fetch(DIRECT_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': localKey
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`ORS API error (${response.status}): ${errText}`);
    }

    return await response.json();
}

/**
 * Fetch a walking route between two points using ORS foot-hiking profile
 * Returns { waypoints: [[lat,lon],...], distance: meters, duration: seconds }
 */
export async function fetchHikingRoute(startLat, startLon, endLat, endLon, viaPoints = []) {
    const coordinates = [
        [startLon, startLat],
        ...viaPoints.map(p => [p[1], p[0]]),
        [endLon, endLat]
    ];

    const data = await callORS({
        coordinates,
        preference: 'recommended',
        instructions: true
    });

    const feature = data.features[0];
    const coords = feature.geometry.coordinates;
    const summary = feature.properties.summary;

    return {
        waypoints: coords.map(c => [c[1], c[0]]),
        distance: summary.distance,
        duration: summary.duration,
        instructions: feature.properties.segments?.[0]?.steps || []
    };
}

/**
 * Fetch a circular hiking route
 * Routes: car park → summit/feature → car park via real hiking trails
 */
export async function fetchCircularRoute(startLat, startLon, destLat, destLon) {
    const coordinates = [
        [startLon, startLat],
        [destLon, destLat],
        [startLon, startLat]
    ];

    const data = await callORS({
        coordinates,
        preference: 'recommended',
        instructions: true
    });

    const feature = data.features[0];
    const coords = feature.geometry.coordinates;
    const summary = feature.properties.summary;

    return {
        waypoints: coords.map(c => [c[1], c[0]]),
        distance: summary.distance,
        duration: summary.duration,
        instructions: feature.properties.segments?.flatMap(s => s.steps) || []
    };
}

/**
 * Create interpolated straight-line points (fallback when no API key)
 */
export function interpolateRoute(start, end, numPoints = 20) {
    const pts = [];
    for (let i = 0; i <= numPoints; i++) {
        const t = i / numPoints;
        pts.push([
            start[0] + (end[0] - start[0]) * t,
            start[1] + (end[1] - start[1]) * t
        ]);
    }
    return pts;
}

/**
 * Format distance from meters
 */
export function formatDistance(meters) {
    if (meters >= 1000) {
        return `${(meters / 1000).toFixed(1)} km`;
    }
    return `${Math.round(meters)} m`;
}

/**
 * Format duration from seconds
 */
export function formatDuration(seconds) {
    const hours = seconds / 3600;
    if (hours >= 1) {
        return `${Math.round(hours * 10) / 10} hours`;
    }
    return `${Math.round(seconds / 60)} mins`;
}
