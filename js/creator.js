/* ═══════════════════════════════════════════════════════
   Walk Creator — Interactive route builder
   ═══════════════════════════════════════════════════════ */

import { createMap, parkingMarker, destMarker, drawRoute, fitToWaypoints } from './map-utils.js';
import { fetchHikingRoute, fetchCircularRoute, interpolateRoute, formatDistance, formatDuration, getORSKey } from './route-service.js';
import { addWalk } from './library.js';

let creatorMap = null;
let startPin = null;
let endPin = null;
let routeLayers = null;
let generatedWaypoints = [];
let startCoords = null;
let endCoords = null;
let clickCount = 0;
let isCircular = true;

/**
 * Initialise the creator view
 */
export function initCreator() {
    if (creatorMap) return;

    creatorMap = createMap('creator-map', {
        center: [54.39, -2.93],
        zoom: 13
    });

    // Click to place pins
    creatorMap.on('click', (e) => {
        const { lat, lng } = e.latlng;
        if (clickCount === 0) {
            setCarPark(lat, lng);
            clickCount = 1;
        } else if (clickCount === 1) {
            setDestination(lat, lng);
            clickCount = 2;
        }
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
        document.getElementById('route-linear').classList.remove('active');
        document.getElementById('route-circular').classList.add('active');
        // Swap
        document.getElementById('route-linear').classList.add('active');
        document.getElementById('route-circular').classList.remove('active');
    });
}

function setCarPark(lat, lng) {
    if (startPin) creatorMap.removeLayer(startPin);
    startCoords = [lat, lng];
    startPin = parkingMarker(lat, lng, 'Car Park').addTo(creatorMap);

    const row = document.getElementById('pin-start');
    row.classList.add('set');
    row.querySelector('.pin-coords').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    checkGenerateReady();
}

function setDestination(lat, lng) {
    if (endPin) creatorMap.removeLayer(endPin);
    endCoords = [lat, lng];
    endPin = destMarker(lat, lng, 'Point of Interest').addTo(creatorMap);

    const row = document.getElementById('pin-end');
    row.classList.add('set');
    row.querySelector('.pin-coords').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    checkGenerateReady();
}

function checkGenerateReady() {
    document.getElementById('btn-generate').disabled = !(startCoords && endCoords);
}

function clearPins() {
    if (startPin) { creatorMap.removeLayer(startPin); startPin = null; }
    if (endPin) { creatorMap.removeLayer(endPin); endPin = null; }
    if (routeLayers) {
        creatorMap.removeLayer(routeLayers.line);
        creatorMap.removeLayer(routeLayers.glow);
        routeLayers = null;
    }

    startCoords = null;
    endCoords = null;
    generatedWaypoints = [];
    clickCount = 0;

    document.getElementById('pin-start').classList.remove('set');
    document.getElementById('pin-start').querySelector('.pin-coords').textContent = 'Click map to set...';
    document.getElementById('pin-end').classList.remove('set');
    document.getElementById('pin-end').querySelector('.pin-coords').textContent = 'Click map to set...';
    document.getElementById('btn-generate').disabled = true;
    document.getElementById('creator-form').style.display = 'none';
    document.getElementById('json-output').style.display = 'none';

    const status = document.querySelector('.creator-map-wrap .route-status');
    if (status) status.remove();
}

/**
 * Generate walking route
 */
async function generateRoute() {
    if (!startCoords || !endCoords) return;

    const btn = document.getElementById('btn-generate');
    btn.disabled = true;
    btn.textContent = '🔄 Generating...';

    const statusEl = document.createElement('div');
    statusEl.className = 'route-status';
    statusEl.innerHTML = '<span class="spinner"></span> Finding best trail route...';
    document.querySelector('.creator-map-wrap').appendChild(statusEl);

    try {
        const hasKey = !!getORSKey();
        let routeData;

        if (hasKey) {
            if (isCircular) {
                routeData = await fetchCircularRoute(startCoords[0], startCoords[1], endCoords[0], endCoords[1]);
            } else {
                routeData = await fetchHikingRoute(startCoords[0], startCoords[1], endCoords[0], endCoords[1]);
            }
            generatedWaypoints = routeData.waypoints;

            // Auto-fill form
            document.getElementById('wf-distance').value = formatDistance(routeData.distance);
            document.getElementById('wf-time').value = formatDuration(routeData.duration);

            statusEl.innerHTML = `✅ Trail route found: ${formatDistance(routeData.distance)}, ~${formatDuration(routeData.duration)}`;
        } else {
            generatedWaypoints = interpolateRoute(startCoords, endCoords);
            statusEl.innerHTML = '⚠️ No ORS API key — showing straight-line preview. Add key in Settings for real trail routing.';
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
        generatedWaypoints = interpolateRoute(startCoords, endCoords);

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
