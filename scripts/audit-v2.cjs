/**
 * Proper ORS Routing — Multi-waypoint circular walks
 * Each walk has 4-6 key waypoints forming a real loop
 * Run: node scripts/audit-v2.cjs
 */
const fs = require('fs');
const path = require('path');

const envFile = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const ORS_KEY = envFile.match(/VITE_ORS_KEY=(.+)/)?.[1]?.trim();
if (!ORS_KEY) { console.error('No VITE_ORS_KEY'); process.exit(1); }

const ORS_URL = 'https://api.openrouteservice.org/v2/directions/foot-hiking/geojson';

/**
 * WALK ROUTES — researched multi-waypoint loops
 * Each entry: { carPark: [lat,lon], loop: [[lat,lon], ...] }
 * For circular: route through carPark → loop[0] → loop[1] → ... → carPark
 * For linear: route through carPark → loop[0] → loop[1] → ... → endPoint
 */
const ROUTES = {
    // === WINDERMERE AREA ===
    'Orrest Head': {
        carPark: [54.3803, -2.9040], // Broad Street car park, Windermere
        loop: [
            [54.3810, -2.9053], // Path start off A591
            [54.3835, -2.9069], // Through Elleray Wood
            [54.3860, -2.9076], // Orrest Head summit
            [54.3870, -2.9060], // North viewpoint
            [54.3855, -2.9030], // East descent path
            [54.3830, -2.9020], // Lower path
        ]
    },
    'Brant Fell': {
        carPark: [54.3622, -2.9236], // Brant Fell Road end, Bowness
        loop: [
            [54.3630, -2.9220], // Path start
            [54.3650, -2.9190], // Brant Fell summit
            [54.3670, -2.9170], // North side
            [54.3660, -2.9210], // Loop back through fields
        ]
    },
    'School Knott': {
        carPark: [54.3677, -2.9205], // Near School Knott Road
        loop: [
            [54.3690, -2.9200], // Path start
            [54.3710, -2.9195], // Ascent
            [54.3720, -2.9190], // School Knott summit
            [54.3715, -2.9165], // East descent
            [54.3695, -2.9180], // Loop back
        ]
    },
    "Gummer's How": {
        carPark: [54.3025, -2.9385], // NT car park Astley's Plantation
        loop: [
            [54.3035, -2.9375], // Path into woods
            [54.3050, -2.9360], // Through plantation
            [54.3060, -2.9350], // Gummer's How summit
            [54.3065, -2.9330], // East side descent
            [54.3045, -2.9340], // Loop back through woods
        ]
    },
    'Wansfell Pike': {
        carPark: [54.4290, -2.9600], // Ambleside, Rydal Road car park
        loop: [
            [54.4300, -2.9580], // Stockghyll Lane start
            [54.4310, -2.9560], // Up through Stockghyll
            [54.4335, -2.9540], // Wansfell Pike summit
            [54.4345, -2.9510], // Nanny Lane descent
            [54.4320, -2.9530], // Through Troutbeck end
            [54.4305, -2.9570], // Back to Ambleside
        ]
    },

    // === TARN HOWS ===
    'Tarn Hows': {
        carPark: [54.3874, -3.0358], // NT car park LA22 0PW
        loop: [
            [54.3880, -3.0380], // Path descending to tarn
            [54.3900, -3.0395], // NE corner of tarn
            [54.3915, -3.0420], // North shore
            [54.3910, -3.0450], // NW bend
            [54.3895, -3.0470], // West side path
            [54.3875, -3.0465], // SW end of tarn
            [54.3865, -3.0440], // South shore
            [54.3870, -3.0400], // SE corner, heading back
        ]
    },

    // === KESWICK / DERWENTWATER ===
    'Catbells': {
        carPark: [54.5640, -3.1700], // Hawes End lay-by
        loop: [
            [54.5625, -3.1695], // Path start heading south
            [54.5590, -3.1650], // Skelgill Bank  
            [54.5555, -3.1618], // Catbells summit
            [54.5530, -3.1600], // South to Hause Gate
            [54.5550, -3.1640], // Hause Gate col
            [54.5580, -3.1680], // Bridleway back north
            [54.5620, -3.1700], // Rejoin road near car park
        ]
    },

    // === GRASMERE ===
    'Helm Crag': {
        carPark: [54.4600, -3.0250], // Grasmere village car park
        loop: [
            [54.4620, -3.0260], // Path start, Easedale Road
            [54.4640, -3.0270], // Up through woods
            [54.4660, -3.0280], // Helm Crag summit (The Lion and The Lamb)
            [54.4650, -3.0295], // Heading south
            [54.4630, -3.0275], // Descend back
        ]
    },
    'Easedale Tarn': {
        carPark: [54.4590, -3.0235], // Grasmere village / Easedale Road
        loop: [
            [54.4600, -3.0300], // Easedale Road heading west
            [54.4610, -3.0400], // Through Easedale valley
            [54.4600, -3.0500], // Easedale Tarn
            [54.4590, -3.0450], // South side return
            [54.4585, -3.0350], // Back through valley
        ]
    },
    'Silver How': {
        carPark: [54.4468, -3.0182], // White Moss car park (A591)
        loop: [
            [54.4470, -3.0220], // Path towards Grasmere
            [54.4460, -3.0300], // West through woods
            [54.4450, -3.0370], // Silver How summit
            [54.4440, -3.0330], // South descent
            [54.4450, -3.0250], // Loop back east
        ]
    },
    'Loughrigg Fell': {
        carPark: [54.4370, -3.0060], // White Moss car park
        loop: [
            [54.4380, -3.0030], // Path start
            [54.4390, -2.9980], // Through Rydal woods
            [54.4370, -2.9950], // Loughrigg summit
            [54.4340, -2.9970], // South descent via Loughrigg Terrace
            [54.4350, -3.0020], // Along Grasmere shore
            [54.4365, -3.0050], // Back to White Moss
        ]
    },
    'Rydal Water & Caves': {
        carPark: [54.4440, -2.9892], // White Moss car park (Rydal side)
        loop: [
            [54.4435, -2.9940], // Path along north shore
            [54.4425, -3.0000], // Rydal Water north
            [54.4410, -3.0070], // Loughrigg Cave viewpoint
            [54.4400, -3.0040], // South shore path
            [54.4415, -2.9960], // Return along south side
        ]
    },

    // === HELVELLYN ===
    'Helvellyn via Striding Edge': {
        carPark: [54.5410, -2.9480], // Glenridding main car park
        loop: [
            [54.5380, -2.9500], // Path south from Glenridding
            [54.5340, -2.9570], // Birkhouse Moor
            [54.5300, -2.9650], // Striding Edge start
            [54.5275, -2.9750], // Along Striding Edge
            [54.5265, -2.9820], // Helvellyn summit area
            [54.5300, -2.9800], // Swirral Edge descent
            [54.5350, -2.9700], // Red Tarn
            [54.5380, -2.9550], // Back to Glenridding
        ]
    },
    'Fairfield Horseshoe': {
        carPark: [54.4560, -2.9610], // Ambleside, Rydal Road
        loop: [
            [54.4580, -2.9640], // Nab Scar start
            [54.4620, -2.9720], // Heron Pike
            [54.4660, -2.9800], // Great Rigg
            [54.4680, -2.9880], // Fairfield summit
            [54.4660, -2.9940], // Hart Crag
            [54.4630, -2.9850], // Dove Crag
            [54.4590, -2.9750], // High Pike descent
            [54.4565, -2.9650], // Low Sweden Bridge return
        ]
    },

    // === CONISTON / LANGDALE ===
    'Coniston Old Man': {
        carPark: [54.3690, -3.0690], // Coniston village car park
        loop: [
            [54.3700, -3.0720], // Church Beck path
            [54.3730, -3.0780], // Through mines
            [54.3767, -3.0850], // Coniston Old Man summit
            [54.3790, -3.0830], // North ridge
            [54.3780, -3.0770], // Wetherlam descent path
            [54.3740, -3.0720], // Back through Coppermines valley
        ]
    },
    'Langdale Pikes': {
        carPark: [54.4418, -3.0647], // ODNB / Stickle Ghyll car park
        loop: [
            [54.4440, -3.0680], // Stickle Ghyll path
            [54.4490, -3.0750], // Up towards Stickle Tarn
            [54.4530, -3.0850], // Harrison Stickle area
            [54.4560, -3.0920], // Pike of Stickle
            [54.4540, -3.0880], // Descent via Dungeon Ghyll
            [54.4480, -3.0750], // Through valley
            [54.4440, -3.0680], // Back to car park
        ]
    },
    'Great Langdale Valley': {
        carPark: [54.4338, -3.0588], // ODNB car park
        loop: [
            [54.4350, -3.0610], // Path north along road
            [54.4370, -3.0650], // Valley path by river
            [54.4400, -3.0690], // Old Dungeon Ghyll area
            [54.4390, -3.0720], // Oxendale bridge
            [54.4365, -3.0670], // Return path south
        ]
    },
    'Blea Tarn Langdale': {
        carPark: [54.4210, -3.0700], // Layby on B5343 pass road
        loop: [
            [54.4230, -3.0720], // Path north to tarn
            [54.4260, -3.0750], // Tarn north shore
            [54.4270, -3.0810], // West end of tarn
            [54.4250, -3.0830], // South west shore
            [54.4230, -3.0790], // South shore path
            [54.4220, -3.0740], // Back towards road
        ]
    },

    // === TILBERTHWAITE ===
    'Cathedral Cavern - Tilberthwaite': {
        carPark: [54.4095, -3.0540], // Tilberthwaite car park
        loop: [
            [54.4080, -3.0560], // Path south
            [54.4060, -3.0600], // Through quarry area
            [54.4020, -3.0680], // Cathedral Cavern
            [54.4040, -3.0650], // Loop back north
            [54.4070, -3.0580], // Return path
        ]
    },
    'Hodge Close Quarry': {
        carPark: [54.4059, -3.0556], // Hodge Close lay-by
        loop: [
            [54.4065, -3.0570], // Path to quarry rim
            [54.4080, -3.0580], // Quarry viewpoint
            [54.4075, -3.0610], // South side
            [54.4060, -3.0590], // Return loop
        ]
    },

    // === WATERFALLS ===
    'Aira Force': {
        carPark: [54.5743, -2.9273], // NT Aira Force car park
        loop: [
            [54.5735, -2.9290], // Path towards gorge
            [54.5720, -2.9310], // Lower bridge
            [54.5714, -2.9367], // Aira Force waterfall
            [54.5730, -2.9350], // High Force Bridge
            [54.5740, -2.9310], // Return on opposite bank
        ]
    },
    'Tom Ghyll Waterfalls': {
        carPark: [54.3858, -3.0482], // Glen Mary Bridge car park
        loop: [
            [54.3860, -3.0470], // Path towards falls
            [54.3870, -3.0440], // Tom Ghyll cascade
            [54.3880, -3.0420], // Upper falls / Tarn Hows edge
            [54.3875, -3.0445], // Return path
        ]
    },

    // === SKELWITH BRIDGE (LINEAR) ===
    'Skelwith Bridge to Elterwater': {
        carPark: [54.4221, -3.0142], // Skelwith Bridge
        isLinear: true,
        loop: [
            [54.4230, -3.0200], // Along River Brathay
            [54.4250, -3.0250], // Through parkland
            [54.4265, -3.0320], // Skelwith Force viewpoint
            [54.4280, -3.0380], // Approaching Elterwater
            [54.4285, -3.0438], // Elterwater village
        ]
    },

    // === BUTTERMERE ===
    'Buttermere Shoreline': {
        carPark: [54.5410, -3.2770], // Buttermere village car park
        loop: [
            [54.5420, -3.2800], // Path west along north shore
            [54.5430, -3.2870], // North shore midpoint
            [54.5420, -3.2930], // West end of lake
            [54.5400, -3.2900], // South shore
            [54.5390, -3.2840], // South shore midpoint
            [54.5400, -3.2790], // East end return
        ]
    },

    // === NEAR SAWREY / HAWKSHEAD ===
    'Claife Heights': {
        carPark: [54.3690, -2.9680], // Near Sawrey / Ash Landing
        loop: [
            [54.3680, -2.9660], // Path into Claife Heights woods
            [54.3670, -2.9610], // Through woodland
            [54.3660, -2.9570], // Claife Heights viewpoint
            [54.3670, -2.9540], // North side
            [54.3690, -2.9600], // Loop back through woods
        ]
    },
    'Latterbarrow': {
        carPark: [54.3705, -2.9430], // Hawkshead Hill road lay-by
        loop: [
            [54.3710, -2.9460], // Path start
            [54.3720, -2.9550], // Through fields
            [54.3730, -2.9670], // Latterbarrow summit
            [54.3720, -2.9620], // Descent east
            [54.3710, -2.9500], // Return path south
        ]
    },

    // === TODD CRAG / AMBLESIDE ===
    'Todd Crag': {
        carPark: [54.4280, -2.9690], // Rothay Park, Ambleside
        loop: [
            [54.4270, -2.9720], // Path west from Rothay Park
            [54.4260, -2.9800], // Through Loughrigg woods
            [54.4250, -2.9890], // Todd Crag viewpoint
            [54.4260, -2.9850], // North side descent
            [54.4275, -2.9750], // Return path
        ]
    },

    // === SCOUT SCAR ===
    'Scout Scar': {
        carPark: [54.3290, -2.7540], // Barrowfield car park
        loop: [
            [54.3280, -2.7560], // Path south along escarpment
            [54.3250, -2.7620], // Scout Scar viewpoint
            [54.3240, -2.7680], // Mushroom Shelter
            [54.3250, -2.7650], // Return north
            [54.3270, -2.7580], // Back through fields
        ]
    },

    // === STAVELEY / WINSTER ===
    'Staveley Riverside & Woodlands': {
        carPark: [54.3760, -2.8140], // Staveley village car park
        loop: [
            [54.3770, -2.8160], // River Kent path
            [54.3790, -2.8190], // Through woodland
            [54.3810, -2.8220], // Riverside viewpoint
            [54.3800, -2.8200], // Loop back
            [54.3780, -2.8160], // Return to village
        ]
    },
    'Troutbeck Tongue': {
        carPark: [54.4260, -2.9300], // Troutbeck village road parking
        loop: [
            [54.4280, -2.9290], // Path north along Troutbeck Road
            [54.4300, -2.9270], // Approaching Tongue area
            [54.4320, -2.9250], // Higher viewpoint
            [54.4310, -2.9280], // Descent east side
            [54.4290, -2.9290], // Return south
        ]
    },
    'South to Winster': {
        carPark: [54.3553, -2.8805], // Near Gilpin area
        loop: [
            [54.3530, -2.8790], // Path south
            [54.3480, -2.8770], // Through fields
            [54.3420, -2.8750], // Winster village
            [54.3450, -2.8800], // Return north
            [54.3500, -2.8810], // Through lanes
        ]
    },
    "St Catherine's Church": {
        carPark: [54.3480, -2.8820], // Public parking near Crook
        loop: [
            [54.3470, -2.8810], // Path south
            [54.3450, -2.8800], // St Catherine's Church  
            [54.3440, -2.8830], // Loop south
            [54.3460, -2.8840], // Return north through fields
        ]
    },
};

const walksPath = path.join(__dirname, '..', 'public', 'data', 'walks.json');
const walks = JSON.parse(fs.readFileSync(walksPath, 'utf8'));

async function fetchORS(coords) {
    const res = await fetch(ORS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': ORS_KEY },
        body: JSON.stringify({ coordinates: coords, preference: 'recommended' })
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`ORS ${res.status}: ${errText.substring(0, 200)}`);
    }
    const data = await res.json();
    const f = data.features[0];
    return {
        wps: f.geometry.coordinates.map(c => [c[1], c[0]]),
        dist: f.properties.summary.distance,
        dur: f.properties.summary.duration
    };
}

async function main() {
    console.log(`Routing ${walks.length} walks with multi-waypoint loops...\n`);
    let ok = 0, fail = 0;

    for (let i = 0; i < walks.length; i++) {
        const w = walks[i];
        const route = ROUTES[w.name];

        if (!route) {
            console.log(`[${i + 1}/${walks.length}] ${w.name} — no route defined, skipping`);
            fail++;
            continue;
        }

        // Update car park coords
        w.lat = route.carPark[0];
        w.lon = route.carPark[1];
        if (!route.isLinear) {
            w.endLat = route.carPark[0];
            w.endLon = route.carPark[1];
        }

        const type = route.isLinear ? 'linear' : 'circular';
        console.log(`[${i + 1}/${walks.length}] ${w.name} (${type}, ${route.loop.length} waypoints)...`);

        try {
            // Build coordinate array: carPark → loop points → (carPark for circular)
            const coords = [
                [route.carPark[1], route.carPark[0]], // [lon, lat] for ORS
                ...route.loop.map(p => [p[1], p[0]]),
            ];
            if (!route.isLinear) {
                coords.push([route.carPark[1], route.carPark[0]]); // Return to start
            }

            const r = await fetchORS(coords);
            walks[i].waypoints = r.wps;
            const km = (r.dist / 1000).toFixed(1);
            console.log(`  ✅ ${r.wps.length} pts, ${km}km`);
            ok++;

            // ORS rate limit: 40 req/min → 1.5s between requests
            if (i < walks.length - 1) await new Promise(resolve => setTimeout(resolve, 1600));
        } catch (e) {
            console.log(`  ❌ ${e.message.substring(0, 120)}`);
            fail++;
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }

    fs.writeFileSync(walksPath, JSON.stringify(walks, null, 2));
    console.log(`\nDone: ${ok} routed, ${fail} failed. Saved to walks.json`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
