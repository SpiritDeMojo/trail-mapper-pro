/**
 * Deep Walk Audit Script
 * Uses Gemini 2.5 Flash + Google Search grounding to verify and fix all walk data.
 * 
 * Run: node scripts/audit-walks.mjs
 * Requires: VITE_GEMINI_KEY in .env.local (or pass as argument)
 */

import { readFileSync, writeFileSync } from 'fs';
import { config } from 'dotenv';

// Load .env.local
config({ path: '.env.local' });

const GEMINI_KEY = process.env.VITE_GEMINI_KEY || process.argv[2];
if (!GEMINI_KEY) {
    console.error('No Gemini API key. Set VITE_GEMINI_KEY in .env.local or pass as argument.');
    process.exit(1);
}

const MODEL = 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`;

const walks = JSON.parse(readFileSync('public/data/walks.json', 'utf8'));
console.log(`\n🔍 Auditing ${walks.length} walks with Gemini + Google Search...\n`);

/**
 * Call Gemini with Google Search grounding
 */
async function callGemini(prompt) {
    const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 4096,
                responseMimeType: 'application/json'
            }
        })
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Gemini ${res.status}: ${err.substring(0, 200)}`);
    }

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts;
    if (!parts) throw new Error('Empty response');

    // Get last text part (skip thinking parts)
    for (let i = parts.length - 1; i >= 0; i--) {
        if (parts[i].text) {
            return parts[i].text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        }
    }
    throw new Error('No text in response');
}

/**
 * Audit a single walk
 */
async function auditWalk(walk) {
    const prompt = `You are a Lake District expert. I need you to VERIFY AND CORRECT the following walk data using real, current information.

CURRENT DATA:
Name: ${walk.name}
Start/Car Park: ${walk.start}
Distance: ${walk.distance}
Time: ${walk.time}
Difficulty: ${walk.difficulty}
Elevation: ${walk.elevation}
Terrain: ${walk.terrain}
Parking Detail: ${walk.parkingDetail || 'MISSING'}
Directions: ${walk.directions ? walk.directions.length + ' steps' : 'MISSING'}
Coordinates: lat=${walk.lat}, lon=${walk.lon}

Please verify using Google Search and return a JSON object with ONLY the fields that need updating. If a field is already correct, do NOT include it.

Return format:
{
    "needsUpdate": true/false,
    "updates": {
        "start": "Corrected car park name if wrong",
        "distance": "Corrected distance if wrong",
        "time": "Corrected walking time if wrong",
        "elevation": "Corrected elevation if wrong",
        "parkingDetail": "Corrected parking detail with REAL postcode, real parking info",
        "terrain": "Corrected terrain description",
        "directions": [{"step":1,"instruction":"...","landmark":"..."}]
    },
    "notes": "Brief explanation of what was wrong and what you corrected"
}

IMPORTANT: 
- Use REAL car park names and postcodes (verify with Google Search)
- Walking times should be based on 3-4 km/h walking speed plus 1 min per 10m ascent (Naismith's rule)
- Only include directions in updates if the existing ones are clearly wrong or missing
- Be conservative — don't change things that are approximately correct`;

    const text = await callGemini(prompt);
    return JSON.parse(text);
}

// Process walks in batches
let updated = 0;
let skipped = 0;
let failed = 0;

for (let i = 0; i < walks.length; i++) {
    const walk = walks[i];
    process.stdout.write(`[${i + 1}/${walks.length}] ${walk.name}... `);

    try {
        const result = await auditWalk(walk);

        if (result.needsUpdate && result.updates) {
            const updates = result.updates;
            let changes = [];

            for (const [key, value] of Object.entries(updates)) {
                if (value !== undefined && value !== null && value !== '') {
                    walks[i][key] = value;
                    changes.push(key);
                }
            }

            if (changes.length > 0) {
                console.log(`✅ Updated: ${changes.join(', ')}`);
                if (result.notes) console.log(`   📝 ${result.notes}`);
                updated++;
            } else {
                console.log('✔️ Correct');
                skipped++;
            }
        } else {
            console.log('✔️ Correct');
            skipped++;
        }

        // Rate limit: 2 seconds between requests
        if (i < walks.length - 1) {
            await new Promise(r => setTimeout(r, 2000));
        }
    } catch (err) {
        console.log(`❌ Error: ${err.message.substring(0, 100)}`);
        failed++;
        // Wait longer on errors (rate limit)
        await new Promise(r => setTimeout(r, 5000));
    }
}

// Save
writeFileSync('public/data/walks.json', JSON.stringify(walks, null, 2));

console.log(`\n${'═'.repeat(50)}`);
console.log(`✅ Updated: ${updated} walks`);
console.log(`✔️ Correct: ${skipped} walks`);
console.log(`❌ Failed: ${failed} walks`);
console.log(`📁 Saved to public/data/walks.json`);
