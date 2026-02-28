/* ═══════════════════════════════════════════════════════
   AI Studio — Gemini-powered walk generator
   ═══════════════════════════════════════════════════════ */

import { createMap, parkingMarker, destMarker, drawRoute, fitToWaypoints } from './map-utils.js';
import { generateWalkFromPrompt, generateDirections } from './gemini-api.js';
import { fetchHikingRoute, fetchCircularRoute, getORSKey, formatDistance, formatDuration } from './route-service.js';
import { addWalk } from './library.js';

let aiMap = null;
let routeLayers = null;
let generatedWalk = null;
let generatedWaypoints = [];

/**
 * Initialise AI Studio view
 */
export function initAIStudio() {
    if (aiMap) return;

    aiMap = createMap('ai-map', {
        center: [54.43, -2.97],
        zoom: 11
    });

    // Generate button
    document.getElementById('btn-ai-generate').addEventListener('click', aiGenerate);

    // Preset buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('ai-prompt').value = btn.dataset.prompt;
        });
    });

    // Export button
    document.getElementById('btn-ai-export').addEventListener('click', exportAIWalk);

    // Add to library button
    document.getElementById('btn-ai-add-library').addEventListener('click', addAIWalkToLibrary);

    // Enter key in textarea
    document.getElementById('ai-prompt').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            aiGenerate();
        }
    });
}

/**
 * Generate a walk using AI
 */
async function aiGenerate() {
    const prompt = document.getElementById('ai-prompt').value.trim();
    if (!prompt) return;

    const btn = document.getElementById('btn-ai-generate');
    const statusEl = document.getElementById('ai-status');
    const resultEl = document.getElementById('ai-result');
    const jsonOutput = document.getElementById('ai-json-output');

    btn.disabled = true;
    btn.textContent = '🔄 Thinking...';
    statusEl.style.display = 'block';
    statusEl.className = 'ai-status';
    statusEl.innerHTML = '<span class="spinner"></span> Gemini is designing your walk...';
    resultEl.style.display = 'none';
    jsonOutput.style.display = 'none';

    try {
        // Step 1: Get walk metadata from Gemini
        statusEl.innerHTML = '<span class="spinner"></span> Step 1/3: AI generating walk details...';
        const walk = await generateWalkFromPrompt(prompt);
        generatedWalk = walk;

        // Step 2: Get real trail route from ORS
        const hasORS = !!getORSKey();
        if (hasORS && walk.lat && walk.lon) {
            statusEl.innerHTML = '<span class="spinner"></span> Step 2/3: Fetching real trail route...';

            try {
                const endLat = walk.endLat || walk.lat;
                const endLon = walk.endLon || walk.lon;
                const isCircular = walk.isCircular !== false && (
                    Math.abs(walk.lat - endLat) < 0.001 && Math.abs(walk.lon - endLon) < 0.001
                );

                let routeData;
                if (isCircular && walk.lat && walk.lon) {
                    // For circular, we need a destination point different from start
                    // Estimate a midpoint to route through
                    const midLat = walk.lat + (Math.random() - 0.5) * 0.02;
                    const midLon = walk.lon + (Math.random() - 0.5) * 0.02;

                    // If AI gave us distinct endLat/endLon that differ from start, use those as via
                    if (walk.endLat && walk.endLon &&
                        (Math.abs(walk.endLat - walk.lat) > 0.001 || Math.abs(walk.endLon - walk.lon) > 0.001)) {
                        routeData = await fetchCircularRoute(walk.lat, walk.lon, walk.endLat, walk.endLon);
                    } else {
                        // Use a nearby point based on the walk distance
                        routeData = await fetchHikingRoute(walk.lat, walk.lon, midLat, midLon);
                    }
                } else {
                    routeData = await fetchHikingRoute(walk.lat, walk.lon, endLat, endLon);
                }

                generatedWaypoints = routeData.waypoints;
                walk.waypoints = generatedWaypoints;

                // Update distance/time with real data
                walk.distance = formatDistance(routeData.distance);
                walk.time = formatDuration(routeData.duration);
            } catch (routeErr) {
                console.warn('ORS routing failed, using AI coordinates:', routeErr);
                // Fallback: create simple waypoints from AI coordinates
                generatedWaypoints = [[walk.lat, walk.lon]];
                if (walk.endLat && walk.endLon) {
                    generatedWaypoints.push([walk.endLat, walk.endLon]);
                }
                walk.waypoints = generatedWaypoints;
            }
        } else {
            // No ORS key — just use AI coordinates
            generatedWaypoints = [[walk.lat, walk.lon]];
            if (walk.endLat && walk.endLon &&
                (Math.abs(walk.endLat - walk.lat) > 0.001 || Math.abs(walk.endLon - walk.lon) > 0.001)) {
                generatedWaypoints.push([walk.endLat, walk.endLon]);
            }
            walk.waypoints = generatedWaypoints;
        }

        // Step 3: Generate directions if AI didn't provide good ones
        if (!walk.directions || walk.directions.length < 3) {
            statusEl.innerHTML = '<span class="spinner"></span> Step 3/3: AI generating directions...';
            const dirs = await generateDirections(walk.name, generatedWaypoints, walk.start || 'Car Park', walk.difficulty);
            if (dirs && dirs.length > 0) walk.directions = dirs;
        }

        // Clean up the walk object for export
        delete walk.isCircular;
        if (!walk.routeUrl) walk.routeUrl = '';
        generatedWalk = walk;

        // Show result
        statusEl.className = 'ai-status success';
        statusEl.innerHTML = `✅ Walk generated: "${walk.name}" — ${walk.distance}, ${walk.time}`;

        renderAIResult(walk);

        // Show on map
        clearMap();
        if (walk.waypoints && walk.waypoints.length > 1) {
            routeLayers = drawRoute(aiMap, walk.waypoints, '#a78bfa');
            fitToWaypoints(aiMap, walk.waypoints, [60, 60]);
            parkingMarker(walk.waypoints[0][0], walk.waypoints[0][1], walk.start || 'Start').addTo(aiMap);
            const lastWp = walk.waypoints[walk.waypoints.length - 1];
            destMarker(lastWp[0], lastWp[1], walk.name).addTo(aiMap);
        } else if (walk.lat && walk.lon) {
            aiMap.setView([walk.lat, walk.lon], 14);
            parkingMarker(walk.lat, walk.lon, walk.start || 'Start').addTo(aiMap);
        }

    } catch (err) {
        console.error('AI generation failed:', err);
        statusEl.className = 'ai-status error';
        statusEl.innerHTML = `❌ Error: ${err.message}`;
    }

    btn.disabled = false;
    btn.textContent = '✨ Generate Walk';
}

function clearMap() {
    if (routeLayers) {
        aiMap.removeLayer(routeLayers.line);
        aiMap.removeLayer(routeLayers.glow);
        routeLayers = null;
    }
    // Remove all markers
    aiMap.eachLayer(layer => {
        if (layer instanceof L.Marker) {
            aiMap.removeLayer(layer);
        }
    });
}

function renderAIResult(walk) {
    const resultEl = document.getElementById('ai-result');
    const cardEl = document.getElementById('ai-walk-card');

    cardEl.innerHTML = `
        <h4>${walk.name}</h4>
        <div class="ai-walk-meta">
            📏 ${walk.distance} · ⏱️ ${walk.time} ·
            <span class="difficulty-badge ${(walk.difficulty || '').toLowerCase()}">${walk.difficulty}</span>
            · ${walk.walkType || 'walk'}
        </div>
        <div class="ai-walk-desc">${walk.thePayoff || walk.desc}</div>
        ${walk.parkingDetail ? `<div style="margin-top:8px;font-size:12px;color:var(--text-muted);">🅿️ ${walk.parkingDetail}</div>` : ''}
        ${walk.directions && walk.directions.length > 0 ? `
            <div style="margin-top:12px;">
                <div style="font-size:11px;text-transform:uppercase;color:var(--accent-dim);font-weight:600;margin-bottom:6px;">🧭 Directions</div>
                ${walk.directions.slice(0, 3).map(d => `
                    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px;">
                        <strong>${d.step}.</strong> ${d.instruction}
                    </div>
                `).join('')}
                ${walk.directions.length > 3 ? `<div style="font-size:11px;color:var(--text-muted);">... +${walk.directions.length - 3} more steps</div>` : ''}
            </div>
        ` : ''}
    `;

    resultEl.style.display = 'block';
}

function exportAIWalk() {
    if (!generatedWalk) return;
    const jsonStr = JSON.stringify(generatedWalk, null, 2);
    const output = document.getElementById('ai-json-output');
    output.textContent = jsonStr;
    output.style.display = 'block';

    navigator.clipboard.writeText(jsonStr).then(() => {
        const btn = document.getElementById('btn-ai-export');
        btn.textContent = '✅ Copied!';
        setTimeout(() => { btn.textContent = '📋 Export JSON'; }, 2000);
    });
}

function addAIWalkToLibrary() {
    if (!generatedWalk) return;
    addWalk(generatedWalk);
    const btn = document.getElementById('btn-ai-add-library');
    btn.textContent = '✅ Added!';
    setTimeout(() => { btn.textContent = '➕ Add to Library'; }, 2000);
}
