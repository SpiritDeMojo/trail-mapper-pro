import { getORSKey, setORSKey, formatDistance, formatDuration } from './route-service.js';
import { getGeminiKey, setGeminiKey } from './gemini-api.js';
import { getWalks, setWalks, addWalk } from './library.js';
import { setGoogleMapsKey } from './map-utils.js';

/**
 * Initialise settings view
 */
export function initSettings() {
    // Load current keys (these are local dev overrides only)
    document.getElementById('settings-ors-key').value = getORSKey();
    document.getElementById('settings-gemini-key').value = getGeminiKey();

    // Load Google Maps key
    const gmField = document.getElementById('settings-google-maps-key');
    if (gmField) gmField.value = localStorage.getItem('google_maps_key') || '';

    // Save settings
    document.getElementById('btn-save-settings').addEventListener('click', saveSettings);

    // GPX import (file input + drag-and-drop)
    const gpxInput = document.getElementById('gpx-file-input');
    const gpxZone = document.getElementById('gpx-drop-zone');
    if (gpxInput) gpxInput.addEventListener('change', (e) => handleGPX(e.target.files[0]));
    if (gpxZone) {
        gpxZone.addEventListener('dragover', (e) => { e.preventDefault(); gpxZone.classList.add('dragover'); });
        gpxZone.addEventListener('dragleave', () => gpxZone.classList.remove('dragover'));
        gpxZone.addEventListener('drop', (e) => {
            e.preventDefault();
            gpxZone.classList.remove('dragover');
            handleGPX(e.dataTransfer.files[0]);
        });
    }

    // Import walk (JSON)
    document.getElementById('btn-import-walk').addEventListener('click', importWalk);

    // Export all
    document.getElementById('btn-export-all').addEventListener('click', exportAll);
}

function saveSettings() {
    const orsKey = document.getElementById('settings-ors-key').value.trim();
    const geminiKey = document.getElementById('settings-gemini-key').value.trim();
    const googleMapsKey = document.getElementById('settings-google-maps-key')?.value.trim();

    if (orsKey) setORSKey(orsKey);
    if (geminiKey) setGeminiKey(geminiKey);
    if (googleMapsKey) setGoogleMapsKey(googleMapsKey);

    const btn = document.getElementById('btn-save-settings');
    btn.textContent = '✅ Saved!';
    setTimeout(() => { btn.textContent = '💾 Save Settings'; }, 2000);
}

/**
 * Haversine distance between two points in meters
 */
function haversineDist(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Parse a GPX file and add the walk to the library
 */
async function handleGPX(file) {
    if (!file) return;
    const statusEl = document.getElementById('gpx-status');
    statusEl.style.display = 'block';
    statusEl.innerHTML = '<span class="spinner"></span> Parsing GPX...';

    try {
        const text = await file.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/xml');

        // Extract track points (<trkpt>) or route points (<rtept>)
        let points = Array.from(doc.querySelectorAll('trkpt'));
        if (points.length === 0) points = Array.from(doc.querySelectorAll('rtept'));
        if (points.length < 2) throw new Error('GPX file contains fewer than 2 points.');

        const waypoints = points.map(pt => [
            parseFloat(pt.getAttribute('lat')),
            parseFloat(pt.getAttribute('lon'))
        ]);

        // Get track name
        const nameEl = doc.querySelector('trk > name') || doc.querySelector('rte > name') || doc.querySelector('metadata > name');
        const name = nameEl ? nameEl.textContent.trim() : file.name.replace('.gpx', '');

        // Calculate total distance
        let totalDist = 0;
        for (let i = 1; i < waypoints.length; i++) {
            totalDist += haversineDist(waypoints[i - 1][0], waypoints[i - 1][1], waypoints[i][0], waypoints[i][1]);
        }

        // Detect circular (start ≈ end)
        const first = waypoints[0];
        const last = waypoints[waypoints.length - 1];
        const isCircular = haversineDist(first[0], first[1], last[0], last[1]) < 200;

        // Estimate time (~4 km/h walking)
        const hours = totalDist / 4000;

        // Extract elevation from GPX if available
        const elePoints = points.map(pt => {
            const ele = pt.querySelector('ele');
            return ele ? parseFloat(ele.textContent) : null;
        }).filter(e => e !== null);
        let elevationGain = 'N/A';
        if (elePoints.length > 1) {
            let gain = 0;
            for (let i = 1; i < elePoints.length; i++) {
                const diff = elePoints[i] - elePoints[i - 1];
                if (diff > 0) gain += diff;
            }
            elevationGain = `${Math.round(gain)}m`;
        }

        const walk = {
            name,
            distance: formatDistance(totalDist),
            time: formatDuration(hours * 3600),
            difficulty: totalDist > 10000 || (elePoints.length && elevationGain !== 'N/A' && parseInt(elevationGain) > 500) ? 'Challenging' : totalDist > 5000 ? 'Moderate' : 'Easy',
            desc: `Imported from GPX: ${name}`,
            start: 'Car Park',
            lat: first[0],
            lon: first[1],
            elevation: elevationGain,
            terrain: '',
            routeUrl: '',
            walkType: 'summit',
            waypoints,
            endLat: isCircular ? first[0] : last[0],
            endLon: isCircular ? first[1] : last[1],
            directions: [],
            parkingDetail: '',
            thePayoff: ''
        };

        addWalk(walk);
        statusEl.className = 'gpx-status success';
        statusEl.innerHTML = `✅ Imported "${name}" — ${formatDistance(totalDist)}, ${waypoints.length} points`;

        // Reset file input
        document.getElementById('gpx-file-input').value = '';
    } catch (err) {
        statusEl.className = 'gpx-status error';
        statusEl.innerHTML = `❌ ${err.message}`;
    }
}

/**
 * Import a walk from pasted JSON
 */
function importWalk() {
    const textArea = document.getElementById('import-json');
    const json = textArea.value.trim();

    if (!json) return;

    try {
        const walk = JSON.parse(json);
        if (!walk.name || !walk.lat) {
            throw new Error('Missing required fields: name, lat');
        }
        addWalk(walk);
        textArea.value = '';

        const btn = document.getElementById('btn-import-walk');
        btn.textContent = `✅ Imported "${walk.name}"!`;
        setTimeout(() => { btn.textContent = '📥 Import Walk'; }, 3000);
    } catch (err) {
        const btn = document.getElementById('btn-import-walk');
        btn.textContent = `❌ ${err.message}`;
        setTimeout(() => { btn.textContent = '📥 Import Walk'; }, 3000);
    }
}

/**
 * Export full walk library as JSON
 */
function exportAll() {
    const walks = getWalks();
    const jsonStr = JSON.stringify(walks, null, 2);

    navigator.clipboard.writeText(jsonStr).then(() => {
        const btn = document.getElementById('btn-export-all');
        btn.textContent = `✅ ${walks.length} walks copied to clipboard!`;
        setTimeout(() => { btn.textContent = '📦 Export Full Library as JSON'; }, 3000);
    });

    // Also offer download
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'trail-mapper-walks.json';
    a.click();
    URL.revokeObjectURL(url);
}
