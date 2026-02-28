/* ═══════════════════════════════════════════════════════
   Settings — API keys, import/export, route audit
   ═══════════════════════════════════════════════════════ */

import { getORSKey, setORSKey, fetchCircularRoute, fetchHikingRoute, formatDistance, formatDuration } from './route-service.js';
import { getGeminiKey, setGeminiKey } from './gemini-api.js';
import { getWalks, setWalks, addWalk } from './library.js';

/**
 * Initialise settings view
 */
export function initSettings() {
    // Load current keys (these are local dev overrides only)
    document.getElementById('settings-ors-key').value = getORSKey();
    document.getElementById('settings-gemini-key').value = getGeminiKey();

    // Save settings
    document.getElementById('btn-save-settings').addEventListener('click', saveSettings);

    // Route audit
    document.getElementById('btn-audit-routes').addEventListener('click', auditRoutes);

    // Import walk
    document.getElementById('btn-import-walk').addEventListener('click', importWalk);

    // Export all
    document.getElementById('btn-export-all').addEventListener('click', exportAll);
}

function saveSettings() {
    const orsKey = document.getElementById('settings-ors-key').value.trim();
    const geminiKey = document.getElementById('settings-gemini-key').value.trim();

    if (orsKey) setORSKey(orsKey);
    if (geminiKey) setGeminiKey(geminiKey);

    const btn = document.getElementById('btn-save-settings');
    btn.textContent = '✅ Saved!';
    setTimeout(() => { btn.textContent = '💾 Save Settings'; }, 2000);
}

/**
 * Re-route all walks using real ORS trail data
 * In production, routes go through the serverless proxy automatically
 */
async function auditRoutes() {
    const walks = getWalks();
    const progressEl = document.getElementById('audit-progress');
    progressEl.style.display = 'block';

    const total = walks.length;
    let completed = 0;
    let failed = 0;

    progressEl.innerHTML = `
        <div>Re-routing ${total} walks using real GPS trail data...</div>
        <div class="progress-bar"><div class="progress-fill" style="width: 0%"></div></div>
        <div id="audit-log" style="margin-top:8px;font-size:11px;color:var(--text-muted);max-height:200px;overflow-y:auto;"></div>
    `;

    const logEl = document.getElementById('audit-log');
    const fillEl = progressEl.querySelector('.progress-fill');

    for (let i = 0; i < walks.length; i++) {
        const w = walks[i];
        const progress = ((i + 1) / total * 100).toFixed(0);
        fillEl.style.width = `${progress}%`;

        try {
            logEl.innerHTML += `<div>🔄 ${w.name}...</div>`;
            logEl.scrollTop = logEl.scrollHeight;

            // Determine if circular or linear
            const isCircular = !w.endLat || !w.endLon ||
                (Math.abs(w.lat - w.endLat) < 0.002 && Math.abs(w.lon - w.endLon) < 0.002);

            let routeData;
            if (isCircular) {
                // For circular walks, use the farthest waypoint as the destination
                let destLat, destLon;
                if (w.waypoints && w.waypoints.length > 4) {
                    // Find the waypoint farthest from start (the summit/feature)
                    let maxDist = 0;
                    for (const wp of w.waypoints) {
                        const dist = Math.abs(wp[0] - w.lat) + Math.abs(wp[1] - w.lon);
                        if (dist > maxDist) {
                            maxDist = dist;
                            destLat = wp[0];
                            destLon = wp[1];
                        }
                    }
                } else {
                    destLat = w.lat + 0.005;
                    destLon = w.lon + 0.005;
                }
                routeData = await fetchCircularRoute(w.lat, w.lon, destLat, destLon);
            } else {
                routeData = await fetchHikingRoute(w.lat, w.lon, w.endLat, w.endLon);
            }

            // Update walk
            walks[i].waypoints = routeData.waypoints;
            walks[i].distance = formatDistance(routeData.distance);
            walks[i].time = formatDuration(routeData.duration);

            completed++;
            logEl.innerHTML += `<div style="color:var(--easy);">✅ ${w.name} — ${formatDistance(routeData.distance)}</div>`;

            // Rate limit: wait 1.5s between requests
            if (i < walks.length - 1) {
                await new Promise(r => setTimeout(r, 1500));
            }
        } catch (err) {
            failed++;
            logEl.innerHTML += `<div style="color:var(--challenging);">❌ ${w.name}: ${err.message}</div>`;
        }

        logEl.scrollTop = logEl.scrollHeight;
    }

    // Save updated walks
    setWalks(walks);

    progressEl.querySelector('div:first-child').innerHTML =
        `✅ Complete: ${completed} re-routed, ${failed} failed out of ${total}`;
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
