/* ═══════════════════════════════════════════════════════
   Walk Creator — Interactive multi-waypoint route builder
   ═══════════════════════════════════════════════════════ */

import { createMap, parkingMarker, destMarker, drawRoute, fitToWaypoints } from './map-utils.js';
import { fetchHikingRoute, fetchCircularRoute, fetchMultiWaypointRoute, interpolateRoute, formatDistance, formatDuration, getORSKey } from './route-service.js';
import { addWalk } from './library.js';

let creatorMap = null;
let creatorWaypoints = []; // Array to hold unlimited clicks
let markers = [];
let routeLayers = null;
let generatedWaypoints = [];
let isCircular = true;

/**
 * Initialise the creator view
 */
export function initCreator() {
    if (creatorMap) return;

    creatorMap = createMap('creator-map', {
        center: [54.43, -2.97], // Center on Lake District
        zoom: 11
    });

    // Click to place unlimited pins
    creatorMap.on('click', (e) => {
        const { lat, lng } = e.latlng;
        creatorWaypoints.push([lat, lng]);

        let markerTitle = creatorWaypoints.length === 1 ? '🅿️ Car Park' : `Waypoint ${creatorWaypoints.length}`;
        let marker = creatorWaypoints.length === 1
            ? parkingMarker(lat, lng, markerTitle).addTo(creatorMap)
            : destMarker(lat, lng, markerTitle).addTo(creatorMap);

        markers.push(marker);

        // Update UI
        document.getElementById('pin-start').classList.add('set');
        document.getElementById('pin-start').querySelector('.pin-coords').textContent = `${creatorWaypoints.length} point${creatorWaypoints.length !== 1 ? 's' : ''} set`;

        checkGenerateReady();
    });

    // Generate button
    document.getElementById('btn-generate').addEventListener('click', generateRoute);

    // Clear button
    document.getElementById('btn-clear').addEventListener('click', clearPins);

    // Export button
    document.getElementById('btn-export').addEventListener('click', exportJSON);

    // Add to library button
    document.getElementById('btn-add-library').addEventListener('click', addToLibrary);

    // Route type toggle
    document.getElementById('route-circular').addEventListener('click', () => {
        isCircular = true;
        document.getElementById('route-circular').classList.add('active');
        document.getElementById('route-linear').classList.remove('active');
    });
    document.getElementById('route-linear').addEventListener('click', () => {
        isCircular = false;
        document.getElementById('route-linear').classList.add('active');
        document.getElementById('route-circular').classList.remove('active');
    });
}

function checkGenerateReady() {
    // Need at least 2 points to generate a route
    document.getElementById('btn-generate').disabled = creatorWaypoints.length < 2;
}

function clearPins() {
    markers.forEach(m => creatorMap.removeLayer(m));
    markers = [];
    if (routeLayers) {
        creatorMap.removeLayer(routeLayers.line);
        creatorMap.removeLayer(routeLayers.glow);
        routeLayers = null;
    }

    creatorWaypoints = [];
    generatedWaypoints = [];

    document.getElementById('pin-start').classList.remove('set');
    document.getElementById('pin-start').querySelector('.pin-coords').textContent = 'Click map to set...';
    document.getElementById('btn-generate').disabled = true;
    document.getElementById('creator-form').style.display = 'none';
    document.getElementById('json-output').style.display = 'none';

    const status = document.querySelector('.creator-map-wrap .route-status');
    if (status) status.remove();
}

/**
 * Generate walking route through all placed waypoints
 */
async function generateRoute() {
    if (creatorWaypoints.length < 2) return;

    const btn = document.getElementById('btn-generate');
    btn.disabled = true;
    btn.textContent = '🔄 Generating...';

    const statusEl = document.createElement('div');
    statusEl.className = 'route-status';
    statusEl.innerHTML = '<span class="spinner"></span> Snapping your points to real trails...';
    document.querySelector('.creator-map-wrap').appendChild(statusEl);

    try {
        const hasKey = !!getORSKey();
        let routeData;

        if (hasKey) {
            // Copy the user's clicked waypoints
            let routePoints = [...creatorWaypoints];

            // If circular, append the first point to the end to close the loop
            if (isCircular) {
                routePoints.push(creatorWaypoints[0]);
            }

            // Use the multi-waypoint fetcher to snap to real trails
            routeData = await fetchMultiWaypointRoute(routePoints);
            generatedWaypoints = routeData.waypoints;

            // Auto-fill form
            document.getElementById('wf-distance').value = formatDistance(routeData.distance);
            document.getElementById('wf-time').value = formatDuration(routeData.duration);

            statusEl.innerHTML = `✅ Trail route snapped: ${formatDistance(routeData.distance)}, ~${formatDuration(routeData.duration)}`;
        } else {
            // Fallback — use the raw clicked points
            generatedWaypoints = [...creatorWaypoints];
            if (isCircular) generatedWaypoints.push(creatorWaypoints[0]);
            statusEl.innerHTML = '⚠️ No ORS API key — showing raw points. Add key in Settings for real trail snapping.';
        }

        // Clear previous route
        if (routeLayers) {
            creatorMap.removeLayer(routeLayers.line);
            creatorMap.removeLayer(routeLayers.glow);
        }

        // Draw route
        routeLayers = drawRoute(creatorMap, generatedWaypoints);
        fitToWaypoints(creatorMap, generatedWaypoints, [60, 60]);

        // Show form
        document.getElementById('creator-form').style.display = 'block';

    } catch (err) {
        console.error('Route generation failed:', err);

        // Fallback to raw points
        generatedWaypoints = [...creatorWaypoints];
        if (isCircular) generatedWaypoints.push(creatorWaypoints[0]);

        if (routeLayers) {
            creatorMap.removeLayer(routeLayers.line);
            creatorMap.removeLayer(routeLayers.glow);
        }

        routeLayers = drawRoute(creatorMap, generatedWaypoints, '#fbbf24');
        fitToWaypoints(creatorMap, generatedWaypoints, [60, 60]);
        document.getElementById('creator-form').style.display = 'block';
        statusEl.innerHTML = `⚠️ ${err.message}`;
    }

    btn.textContent = 'Generate Trail Route';
    btn.disabled = false;

    setTimeout(() => { if (statusEl.parentNode) statusEl.remove(); }, 8000);
}

/**
 * Build walk object from form
 */
function buildWalkObject() {
    const startCoords = creatorWaypoints[0];
    const endCoords = creatorWaypoints[creatorWaypoints.length - 1];

    return {
        name: document.getElementById('wf-name').value || 'Unnamed Walk',
        distance: document.getElementById('wf-distance').value || '',
        time: document.getElementById('wf-time').value || '',
        difficulty: document.getElementById('wf-difficulty').value,
        desc: document.getElementById('wf-desc').value || '',
        start: document.getElementById('wf-parking').value.split(',')[0] || 'Car Park',
        lat: startCoords[0],
        lon: startCoords[1],
        elevation: document.getElementById('wf-elevation').value || 'N/A',
        terrain: document.getElementById('wf-terrain').value || '',
        routeUrl: '',
        walkType: document.getElementById('wf-walktype').value,
        waypoints: generatedWaypoints,
        endLat: isCircular ? startCoords[0] : endCoords[0],
        endLon: isCircular ? startCoords[1] : endCoords[1],
        directions: [],
        parkingDetail: document.getElementById('wf-parking').value || '',
        thePayoff: document.getElementById('wf-payoff').value || ''
    };
}

/**
 * Export walk as JSON to clipboard
 */
function exportJSON() {
    const walk = buildWalkObject();
    const jsonStr = JSON.stringify(walk, null, 2);
    const output = document.getElementById('json-output');
    output.textContent = jsonStr;
    output.style.display = 'block';

    navigator.clipboard.writeText(jsonStr).then(() => {
        const btn = document.getElementById('btn-export');
        btn.textContent = '✅ Copied to clipboard!';
        setTimeout(() => { btn.textContent = '📋 Export as JSON'; }, 2000);
    }).catch(() => {
        const range = document.createRange();
        range.selectNode(output);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
    });
}

/**
 * Add walk directly to library
 */
function addToLibrary() {
    const walk = buildWalkObject();
    addWalk(walk);
    const btn = document.getElementById('btn-add-library');
    btn.textContent = '✅ Added to Library!';
    setTimeout(() => { btn.textContent = '➕ Add to Library'; }, 2000);
}
