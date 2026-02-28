/**
 * ORS Route Fix — Re-routes ALL walks through OpenRouteService foot-hiking
 * Replaces interpolated waypoints with REAL trail paths
 * Run: node scripts/fix-routes.cjs
 */
const fs = require('fs');
const path = require('path');

const envFile = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const ORS_KEY = envFile.match(/VITE_ORS_KEY=(.+)/)?.[1]?.trim();
if (!ORS_KEY) { console.error('No VITE_ORS_KEY'); process.exit(1); }

const ORS_URL = 'https://api.openrouteservice.org/v2/directions/foot-hiking/geojson';

// Car park fixes — these coords are known to be wrong
const FIXES = {
    'Catbells': { lat: 54.5735, lon: -3.1710 },
    'Helvellyn via Striding Edge': { lat: 54.5310, lon: -2.9525 },
    'Claife Heights': { lat: 54.3770, lon: -2.9590 },
};

// Destination summit/feature for circular walks
const DEST = {
    'Orrest Head': [54.3860, -2.9076],
    'Tarn Hows': [54.3890, -3.0420],
    'Aira Force': [54.5714, -2.9367],
    'Catbells': [54.5554, -3.1618],
    'Helvellyn via Striding Edge': [54.5310, -2.9770],
    'Loughrigg Fell': [54.4367, -2.9950],
    "Gummer's How": [54.3060, -2.9350],
    'School Knott': [54.3720, -2.9190],
    'Brant Fell': [54.3650, -2.9190],
    'Todd Crag': [54.4250, -2.9890],
    'Wansfell Pike': [54.4310, -2.9540],
    'Helm Crag': [54.4660, -3.0280],
    'Latterbarrow': [54.3730, -2.9670],
    'Silver How': [54.4450, -3.0370],
    'Claife Heights': [54.3670, -2.9570],
    'Fairfield Horseshoe': [54.4660, -2.9880],
    'Scout Scar': [54.3240, -2.7680],
    'Easedale Tarn': [54.4600, -3.0500],
    'Rydal Water & Caves': [54.4410, -3.0070],
    'Buttermere Shoreline': [54.5430, -3.2810],
    'Great Langdale Valley': [54.4520, -3.0800],
    'Cathedral Cavern - Tilberthwaite': [54.4020, -3.0680],
    'Tom Ghyll Waterfalls': [54.3870, -3.0420],
    'Hodge Close Quarry': [54.4080, -3.0580],
    'Blea Tarn Langdale': [54.4290, -3.0790],
    'Coniston Old Man': [54.3767, -3.0850],
    'Langdale Pikes': [54.4560, -3.0920],
    'Staveley Riverside & Woodlands': [54.3790, -2.8190],
    'Troutbeck Tongue': [54.4360, -2.9160],
    'South to Winster': [54.3420, -2.8750],
    "St Catherine's Church": [54.3450, -2.8800],
    'Skelwith Bridge to Elterwater': [54.4285, -3.0438],
};

const walksPath = path.join(__dirname, '..', 'public', 'data', 'walks.json');
const walks = JSON.parse(fs.readFileSync(walksPath, 'utf8'));

async function fetchORS(coords) {
    const res = await fetch(ORS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': ORS_KEY },
        body: JSON.stringify({ coordinates: coords, preference: 'recommended' })
    });
    if (!res.ok) throw new Error(`ORS ${res.status}: ${(await res.text()).substring(0, 150)}`);
    const data = await res.json();
    const f = data.features[0];
    return {
        wps: f.geometry.coordinates.map(c => [c[1], c[0]]),
        dist: f.properties.summary.distance,
        dur: f.properties.summary.duration
    };
}

async function main() {
    console.log(`Re-routing ${walks.length} walks via ORS foot-hiking...\n`);
    let ok = 0, fail = 0;

    for (let i = 0; i < walks.length; i++) {
        const w = walks[i];

        // Apply car park fixes
        if (FIXES[w.name]) {
            const f = FIXES[w.name];
            const wasCirc = w.endLat === w.lat && w.endLon === w.lon;
            w.lat = f.lat; w.lon = f.lon;
            if (wasCirc) { w.endLat = f.lat; w.endLon = f.lon; }
            console.log(`  Fixed car park: ${w.name}`);
        }

        const circ = w.endLat === w.lat && w.endLon === w.lon;
        console.log(`[${i + 1}/${walks.length}] ${w.name} (${circ ? 'circ' : 'lin'})...`);

        try {
            let coords;
            if (circ) {
                const d = DEST[w.name];
                if (!d) { console.log('  Skip: no dest'); fail++; continue; }
                coords = [[w.lon, w.lat], [d[1], d[0]], [w.lon, w.lat]];
            } else {
                coords = [[w.lon, w.lat], [w.endLon, w.endLat]];
            }

            const r = await fetchORS(coords);
            walks[i].waypoints = r.wps;
            console.log(`  ✅ ${r.wps.length} pts, ${(r.dist / 1000).toFixed(1)}km`);
            ok++;
            if (i < walks.length - 1) await new Promise(resolve => setTimeout(resolve, 1600));
        } catch (e) {
            console.log(`  ❌ ${e.message.substring(0, 100)}`);
            fail++;
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }

    fs.writeFileSync(walksPath, JSON.stringify(walks, null, 2));
    console.log(`\nDone: ${ok} routed, ${fail} failed`);
}

main().catch(e => { console.error(e); process.exit(1); });
