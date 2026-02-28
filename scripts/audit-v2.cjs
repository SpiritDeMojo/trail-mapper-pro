/**
 * Deep Audit v2 — CommonJS version (avoids dotenv v17 ESM interference)
 * Run: node scripts/audit-v2.cjs
 */
const fs = require('fs');
const path = require('path');

// Read .env.local manually
const envPath = path.join(__dirname, '..', '.env.local');
const envFile = fs.readFileSync(envPath, 'utf8');
const GEMINI_KEY = envFile.match(/VITE_GEMINI_KEY=(.+)/)?.[1]?.trim();
if (!GEMINI_KEY) { console.error('No VITE_GEMINI_KEY in .env.local'); process.exit(1); }
console.log('Gemini key loaded OK\n');

const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
const walksPath = path.join(__dirname, '..', 'public', 'data', 'walks.json');
const walks = JSON.parse(fs.readFileSync(walksPath, 'utf8'));

async function callGemini(prompt) {
    const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 8192, responseMimeType: 'application/json' }
        })
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).substring(0, 200)}`);
    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts;
    if (!parts) throw new Error('Empty response');
    for (let i = parts.length - 1; i >= 0; i--) {
        if (parts[i].text) return parts[i].text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    }
    throw new Error('No text in response');
}

async function auditWalk(walk) {
    const isCircular = walk.endLat === walk.lat && walk.endLon === walk.lon;
    const prompt = `You are a Lake District walking expert with deep knowledge of AllTrails, Ordnance Survey maps, Wainwright guides, and local walking forums.

DEEP VERIFY this walk. Cross-reference with AllTrails and established walking guides.

WALK DATA:
Name: ${walk.name}
Start/Car Park: ${walk.start}
Car Park Coords: lat=${walk.lat}, lon=${walk.lon}
End Coords: endLat=${walk.endLat || 'MISSING'}, endLon=${walk.endLon || 'MISSING'}
Currently classified as: ${isCircular ? 'CIRCULAR' : 'LINEAR'}
Distance: ${walk.distance}
Time: ${walk.time}
Difficulty: ${walk.difficulty}
Elevation: ${walk.elevation}
Terrain: ${walk.terrain}
Walk Type: ${walk.walkType}
Parking: ${walk.parkingDetail || 'MISSING'}
The Payoff: ${walk.thePayoff || 'MISSING'}
Desc: ${walk.desc}
Has Directions: ${walk.directions ? walk.directions.length + ' steps' : 'NONE'}
${walk.directions ? 'Direction summary: ' + walk.directions.map(d => d.instruction.substring(0, 60)).join(' | ') : ''}

VERIFICATION CHECKLIST:
1. CIRCULAR vs LINEAR: Is this walk actually circular (returns to start) or linear (one-way)? 
   - If CIRCULAR: endLat/endLon MUST equal lat/lon
   - If LINEAR: endLat/endLon MUST be different from lat/lon
2. CAR PARK: Is "${walk.start}" the real car park name at these coordinates?
3. CAR PARK COORDS: Do lat=${walk.lat}, lon=${walk.lon} point to an actual car park/lay-by?
4. DISTANCE: What does AllTrails/OS say for this route? Must match the described route.
5. TIME: Apply Naismith's rule (4 km/h walking + 1 min per 10m ascent). Is it realistic?
6. ELEVATION: Is this TOTAL ASCENT (not summit height)? Verify against AllTrails.
7. PARKING: Include real postcode, fees, NT membership info, grid reference if known.
8. DIRECTIONS: Are they accurate for the ACTUAL walking route? Do they match what a walker would really follow? If missing or inaccurate, provide 6-8 detailed, followable steps.
9. ROUTE ACCURACY: Would the described directions match the highlighted path on a map?

Return JSON:
{
    "needsUpdate": true/false,
    "isCircular": true/false,
    "updates": {
        "start": "only if wrong",
        "lat": number,
        "lon": number,
        "endLat": number,
        "endLon": number,
        "distance": "X.X km",
        "time": "X hours/mins",
        "difficulty": "Easy/Moderate/Challenging",
        "elevation": "Xm",
        "terrain": "description",
        "parkingDetail": "full detail with postcode",
        "thePayoff": "evocative sentence",
        "desc": "2-3 sentence description",
        "directions": [{"step":1,"instruction":"...","landmark":"..."}]
    },
    "notes": "what was wrong and what sources confirm the correction"
}

ONLY include fields in "updates" that ACTUALLY need changing. If directions exist and accurately describe a real walkable route, do NOT replace them.`;

    return JSON.parse(await callGemini(prompt));
}

async function main() {
    console.log(`Deep auditing ${walks.length} walks...\n`);
    let updated = 0, correct = 0, failed = 0;

    for (let i = 0; i < walks.length; i++) {
        const walk = walks[i];
        const isCirc = walk.endLat === walk.lat && walk.endLon === walk.lon;
        console.log(`[${i + 1}/${walks.length}] ${walk.name} (${isCirc ? 'circular' : 'linear'})...`);

        try {
            const r = await auditWalk(walk);

            // Fix circular/linear classification
            if (r.isCircular !== undefined) {
                if (r.isCircular && (walk.endLat !== walk.lat || walk.endLon !== walk.lon)) {
                    walks[i].endLat = walk.lat;
                    walks[i].endLon = walk.lon;
                }
            }

            if (r.needsUpdate && r.updates) {
                const changes = [];
                for (const [k, v] of Object.entries(r.updates)) {
                    if (v !== undefined && v !== null && v !== '') { walks[i][k] = v; changes.push(k); }
                }
                if (changes.length > 0) {
                    console.log(`  ✅ Updated: ${changes.join(', ')}`);
                    if (r.notes) console.log(`  📝 ${r.notes.substring(0, 200)}`);
                    updated++;
                } else { console.log('  ✔️ Correct'); correct++; }
            } else { console.log('  ✔️ Correct'); correct++; }

            // Rate limit
            if (i < walks.length - 1) await new Promise(r => setTimeout(r, 3000));
        } catch (err) {
            console.log(`  ❌ Error: ${err.message.substring(0, 120)}`);
            failed++;
            await new Promise(r => setTimeout(r, 5000));
        }
    }

    fs.writeFileSync(walksPath, JSON.stringify(walks, null, 2));
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`✅ Updated: ${updated} walks`);
    console.log(`✔️ Correct: ${correct} walks`);
    console.log(`❌ Failed: ${failed} walks`);
    console.log(`📁 Saved to public/data/walks.json`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
