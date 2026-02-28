/* ═══════════════════════════════════════════════════════
   Route Service — OpenRouteService foot-hiking API
   ═══════════════════════════════════════════════════════ */

// In production, requests go through /api/ors serverless proxy (keys stay server-side)
// In local dev, falls back to direct API call if a key is set in settings
const PROXY_ENDPOINT = '/api/ors';
const DIRECT_ENDPOINT = 'https://api.openrouteservice.org/v2/directions/foot-hiking/geojson';

/**
 * Get stored ORS API key (only used for local dev fallback)
 */
export function getORSKey() {
    return localStorage.getItem('ors_api_key') || '';
}

/**
 * Set ORS API key
 */
export function setORSKey(key) {
    localStorage.setItem('ors_api_key', key);
}

/**
 * Make an ORS API request — uses proxy in production, direct key in local dev
 */
async function callORS(requestBody) {
    // Try serverless proxy first (production)
    try {
        const proxyRes = await fetch(PROXY_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (proxyRes.ok) {
            return await proxyRes.json();
        }

        // If proxy returns 500 (no key configured) and we have a local key, fall back
        const localKey = getORSKey();
        if (proxyRes.status === 500 && localKey) {
            return await callORSDirect(requestBody, localKey);
        }

        const errText = await proxyRes.text();
        throw new Error(`ORS API error (${proxyRes.status}): ${errText}`);
    } catch (err) {
        // Network error on proxy (local dev without Vercel) — try direct
        const localKey = getORSKey();
        if (localKey) {
            return await callORSDirect(requestBody, localKey);
        }
        throw err;
    }
}

/**
 * Direct ORS API call (local dev fallback only)
 */
async function callORSDirect(requestBody, apiKey) {
    const response = await fetch(DIRECT_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': apiKey
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
    // Build coordinates array: [start, ...via, end] in [lon, lat] format (ORS convention)
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
        waypoints: coords.map(c => [c[1], c[0]]), // Convert [lon,lat] → [lat,lon]
        distance: summary.distance,
        duration: summary.duration,
        instructions: feature.properties.segments?.[0]?.steps || []
    };
}

/**
 * Fetch a circular hiking route
 * Routes: start → destination (summit/feature) → start
 */
export async function fetchCircularRoute(startLat, startLon, destLat, destLon) {
    // For a circular route, go: start → destination → start
    // ORS will find different trail paths for each leg
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
