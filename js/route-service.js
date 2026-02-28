/* ═══════════════════════════════════════════════════════
   Route Service — OpenRouteService foot-hiking API
   ═══════════════════════════════════════════════════════ */

const ORS_ENDPOINT = 'https://api.openrouteservice.org/v2/directions/foot-hiking/geojson';

// Default key — can be overridden via settings
const DEFAULT_ORS_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjU0ZTI0YTM0MGI0YTQyMzY5ODZlYzZkZjhiMzAxMmFkIiwiaCI6Im11cm11cjY0In0=';

/**
 * Get stored ORS API key
 */
export function getORSKey() {
    return localStorage.getItem('ors_api_key') || DEFAULT_ORS_KEY;
}

/**
 * Set ORS API key
 */
export function setORSKey(key) {
    localStorage.setItem('ors_api_key', key);
}

/**
 * Fetch a walking route between two points using ORS foot-hiking profile
 * Returns { waypoints: [[lat,lon],...], distance: meters, duration: seconds }
 */
export async function fetchHikingRoute(startLat, startLon, endLat, endLon, viaPoints = []) {
    const apiKey = getORSKey();
    if (!apiKey) {
        throw new Error('No OpenRouteService API key set. Go to Settings to add one.');
    }

    // Build coordinates array: [start, ...via, end] in [lon, lat] format (ORS convention)
    const coordinates = [
        [startLon, startLat],
        ...viaPoints.map(p => [p[1], p[0]]),
        [endLon, endLat]
    ];

    const response = await fetch(ORS_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': apiKey
        },
        body: JSON.stringify({
            coordinates,
            preference: 'recommended',
            instructions: true
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`ORS API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
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
 * Uses a midpoint estimation to create a via-point for the return leg
 */
export async function fetchCircularRoute(startLat, startLon, destLat, destLon) {
    const apiKey = getORSKey();
    if (!apiKey) {
        throw new Error('No OpenRouteService API key set. Go to Settings to add one.');
    }

    // For a circular route, go: start → destination → start
    // ORS will find different paths for each leg if the terrain allows
    const coordinates = [
        [startLon, startLat],
        [destLon, destLat],
        [startLon, startLat]
    ];

    const response = await fetch(ORS_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': apiKey
        },
        body: JSON.stringify({
            coordinates,
            preference: 'recommended',
            instructions: true
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`ORS API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
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
