/* ═══════════════════════════════════════════════════════
   Walk Library — Grid + Detail View
   ═══════════════════════════════════════════════════════ */

import { createMap, difficultyColor, walkTypeIcon, parkingMarker, destMarker, drawRoute, fitToWaypoints, downloadGPX, renderElevationProfile } from './map-utils.js';

let walks = [];
let filteredWalks = [];
let detailMap = null;
let activeFilters = { difficulty: 'all', type: 'all' };

const WALKS_VERSION = '1.1'; // Bump this to invalidate localStorage cache

/**
 * Get walk data (from localStorage if modified, otherwise from server)
 */
export async function loadWalks() {
    // Check version to invalidate stale cache
    const cachedVersion = localStorage.getItem('trail_mapper_walks_version');
    if (cachedVersion !== WALKS_VERSION) {
        localStorage.removeItem('trail_mapper_walks');
        localStorage.setItem('trail_mapper_walks_version', WALKS_VERSION);
    }

    // Check for locally modified walks
    const localWalks = localStorage.getItem('trail_mapper_walks');
    if (localWalks) {
        try {
            walks = JSON.parse(localWalks);
        } catch {
            walks = [];
        }
    }

    if (walks.length === 0) {
        const res = await fetch('/data/walks.json');
        walks = await res.json();
        saveWalksLocal();
    }

    filteredWalks = [...walks];
    renderGrid();
    setupFilters();
}

/**
 * Save walks to localStorage
 */
function saveWalksLocal() {
    localStorage.setItem('trail_mapper_walks', JSON.stringify(walks));
}

/**
 * Get all walks
 */
export function getWalks() {
    return walks;
}

/**
 * Set walks (for re-routing)
 */
export function setWalks(newWalks) {
    walks = newWalks;
    saveWalksLocal();
    filteredWalks = walks.filter(w => {
        if (activeFilters.difficulty !== 'all' && w.difficulty !== activeFilters.difficulty) return false;
        if (activeFilters.type !== 'all' && w.walkType !== activeFilters.type) return false;
        return true;
    });
    renderGrid();
}

/**
 * Add a single walk to the library
 */
export function addWalk(walk) {
    walks.push(walk);
    saveWalksLocal();
    filteredWalks = [...walks];
    renderGrid();
}

/**
 * Render walk grid
 */
function renderGrid() {
    const grid = document.getElementById('walk-grid');
    const stats = document.getElementById('filter-stats');

    if (filteredWalks.length === 0) {
        grid.innerHTML = `<div class="empty-msg"><span class="empty-icon">🥾</span>No walks match your filters.<br>Try adjusting the filters above.</div>`;
        stats.textContent = '0 walks';
        return;
    }

    stats.textContent = `${filteredWalks.length} walk${filteredWalks.length !== 1 ? 's' : ''}`;

    grid.innerHTML = filteredWalks.map((w, i) => `
        <div class="walk-card" data-index="${walks.indexOf(w)}" tabindex="0">
            <div class="walk-card-header">
                <h3>${w.name}</h3>
                <span class="walk-type-icon">${walkTypeIcon(w.walkType)}</span>
            </div>
            <div class="walk-card-meta">
                <span>📏 ${w.distance}</span>
                <span>⏱️ ${w.time}</span>
                <span>⛰️ ${w.elevation || 'N/A'}</span>
                <span class="difficulty-badge ${(w.difficulty || '').toLowerCase()}">${w.difficulty}</span>
            </div>
            <p class="walk-card-desc">${w.thePayoff || w.desc}</p>
            <div class="walk-card-footer">
                <span class="walk-tag">${w.walkType || 'walk'}</span>
                <span class="walk-tag">${w.terrain}</span>
            </div>
        </div>
    `).join('');

    // Attach click handlers
    grid.querySelectorAll('.walk-card').forEach(card => {
        card.addEventListener('click', () => openDetail(parseInt(card.dataset.index)));
        card.addEventListener('keydown', e => {
            if (e.key === 'Enter') openDetail(parseInt(card.dataset.index));
        });
    });
}

/**
 * Setup filter pill clicks
 */
function setupFilters() {
    document.getElementById('difficulty-filter').addEventListener('click', e => {
        const pill = e.target.closest('.pill');
        if (!pill) return;
        document.querySelectorAll('#difficulty-filter .pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        activeFilters.difficulty = pill.dataset.value;
        applyFilters();
    });

    document.getElementById('type-filter').addEventListener('click', e => {
        const pill = e.target.closest('.pill');
        if (!pill) return;
        document.querySelectorAll('#type-filter .pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        activeFilters.type = pill.dataset.value;
        applyFilters();
    });
}

function applyFilters() {
    filteredWalks = walks.filter(w => {
        if (activeFilters.difficulty !== 'all' && w.difficulty !== activeFilters.difficulty) return false;
        if (activeFilters.type !== 'all' && w.walkType !== activeFilters.type) return false;
        return true;
    });
    renderGrid();
}

/**
 * Open walk detail view
 */
export function openDetail(index) {
    const w = walks[index];
    if (!w) return;

    const detail = document.getElementById('view-detail');
    const library = document.getElementById('view-library');

    // Populate header
    document.getElementById('detail-name').textContent = w.name;
    document.getElementById('detail-badge').textContent = `${walkTypeIcon(w.walkType)} ${w.walkType || 'walk'}`;
    document.getElementById('detail-badge').style.background = `${difficultyColor(w.difficulty)}22`;
    document.getElementById('detail-badge').style.color = difficultyColor(w.difficulty);
    document.getElementById('detail-meta').innerHTML = `
        <span>📏 ${w.distance}</span>
        <span>⏱️ ${w.time}</span>
        <span style="color:${difficultyColor(w.difficulty)};font-weight:600;">${w.difficulty}</span>
        <span>📍 ${w.start}</span>
    `;

    // Payoff
    const payoffEl = document.getElementById('detail-payoff');
    if (w.thePayoff) {
        payoffEl.innerHTML = `"${w.thePayoff}"`;
        payoffEl.style.display = 'block';
    } else {
        payoffEl.style.display = 'none';
    }

    // Description
    document.getElementById('detail-desc').textContent = w.desc;

    // Stats
    document.getElementById('detail-stats').innerHTML = `
        <div class="stat-item"><div class="stat-label">Distance</div><div class="stat-value">${w.distance}</div></div>
        <div class="stat-item"><div class="stat-label">Time</div><div class="stat-value">${w.time}</div></div>
        <div class="stat-item"><div class="stat-label">Elevation</div><div class="stat-value">${w.elevation || 'N/A'}</div></div>
        <div class="stat-item"><div class="stat-label">Terrain</div><div class="stat-value">${w.terrain}</div></div>
        <div class="stat-item"><div class="stat-label">Start</div><div class="stat-value">${w.start}</div></div>
        <div class="stat-item"><div class="stat-label">Type</div><div class="stat-value">${walkTypeIcon(w.walkType)} ${w.walkType || 'walk'}</div></div>
    `;

    // Parking
    const parkP = document.getElementById('detail-parking');
    if (w.parkingDetail) {
        parkP.innerHTML = `<h4>🅿️ Parking</h4><p>${w.parkingDetail}</p>`;
        parkP.style.display = 'block';
    } else {
        parkP.style.display = 'none';
    }

    // Directions
    const dirDiv = document.getElementById('detail-directions');
    if (w.directions && w.directions.length > 0) {
        dirDiv.innerHTML = `
            <h4>🧭 Step-by-Step Directions</h4>
            ${w.directions.map(d => `
                <div class="direction-step">
                    <span class="step-num">${d.step}</span>
                    <div class="step-content">
                        <div class="step-landmark">${d.landmark}</div>
                        <div class="step-instruction">${d.instruction}</div>
                    </div>
                </div>
            `).join('')}
        `;
        dirDiv.style.display = 'block';
    } else {
        dirDiv.style.display = 'none';
    }

    // Export + GPX buttons
    document.getElementById('btn-export-detail').onclick = () => {
        const jsonStr = JSON.stringify(w, null, 2);
        navigator.clipboard.writeText(jsonStr).then(() => {
            const btn = document.getElementById('btn-export-detail');
            btn.textContent = '✅ Copied to clipboard!';
            setTimeout(() => { btn.textContent = '📋 Export Walk JSON'; }, 2000);
        });
    };

    // GPX download button
    let gpxBtn = document.getElementById('btn-gpx-download');
    if (!gpxBtn) {
        gpxBtn = document.createElement('button');
        gpxBtn.id = 'btn-gpx-download';
        gpxBtn.className = 'btn-secondary';
        gpxBtn.textContent = '📥 Download GPX';
        gpxBtn.style.cssText = 'margin-left:8px;';
        document.getElementById('btn-export-detail').parentNode.appendChild(gpxBtn);
    }
    gpxBtn.onclick = () => {
        downloadGPX(w);
        gpxBtn.textContent = '✅ Downloaded!';
        setTimeout(() => { gpxBtn.textContent = '📥 Download GPX'; }, 2000);
    };

    // Route type badge (Circular/Linear)
    const isCircular = w.endLat === w.lat && w.endLon === w.lon;
    const routeType = document.getElementById('detail-route-type');
    if (routeType) {
        routeType.innerHTML = isCircular
            ? '<span style="color:#4ecdc4;">🔄 Circular Route</span>'
            : '<span style="color:#a78bfa;">➡️ Linear Route</span>';
    }

    // Show detail, hide library
    library.classList.remove('active');
    detail.classList.add('active');
    detail.style.display = 'block';

    // Render map
    setTimeout(() => {
        if (detailMap) { detailMap.remove(); detailMap = null; }

        detailMap = createMap('detail-map', {
            center: [w.lat, w.lon],
            zoom: 14
        });

        if (w.waypoints && w.waypoints.length > 1) {
            drawRoute(detailMap, w.waypoints);
            fitToWaypoints(detailMap, w.waypoints, [50, 50]);

            // Start marker
            const startWp = w.waypoints[0];
            parkingMarker(startWp[0], startWp[1], w.start).addTo(detailMap);

            // End/feature marker
            const endWp = w.waypoints[w.waypoints.length - 1];
            if (w.endLat && w.endLon &&
                (Math.abs(w.endLat - startWp[0]) > 0.001 || Math.abs(w.endLon - startWp[1]) > 0.001)) {
                destMarker(w.endLat, w.endLon, w.name).addTo(detailMap);
            } else {
                const midIdx = Math.floor(w.waypoints.length / 3);
                const midWp = w.waypoints[midIdx];
                destMarker(midWp[0], midWp[1], w.name + ' (feature)').addTo(detailMap);
            }
        } else {
            parkingMarker(w.lat, w.lon, w.start).addTo(detailMap);
        }

        // Render elevation profile
        renderElevationProfile('detail-elevation', w.waypoints, w.elevation);
    }, 100);

    detail.scrollTop = 0;
}

/**
 * Close detail and return to library
 */
export function closeDetail() {
    document.getElementById('view-detail').classList.remove('active');
    document.getElementById('view-detail').style.display = 'none';
    document.getElementById('view-library').classList.add('active');
    if (detailMap) { detailMap.remove(); detailMap = null; }
}
