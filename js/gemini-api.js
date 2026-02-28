/* ═══════════════════════════════════════════════════════
   Gemini API — Google Generative AI client for walk generation
   ═══════════════════════════════════════════════════════ */

const PROXY_ENDPOINT = '/api/gemini';
const DIRECT_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

/**
 * Get Gemini API key — checks localStorage first, then Vite env var for local dev
 */
export function getGeminiKey() {
    return localStorage.getItem('gemini_api_key') || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_KEY) || '';
}

/**
 * Set Gemini API key (localStorage override)
 */
export function setGeminiKey(key) {
    localStorage.setItem('gemini_api_key', key);
}

/**
 * Make a Gemini API request — tries proxy (production), falls back to direct (local dev)
 */
async function callGemini(requestBody) {
    // Try serverless proxy first
    try {
        const proxyRes = await fetch(PROXY_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (proxyRes.ok) {
            return await proxyRes.json();
        }
        // Proxy failed — fall through to direct call
    } catch (err) {
        // Network error (proxy doesn't exist in local dev) — fall through
    }

    // Direct API call with local key
    const localKey = getGeminiKey();
    if (!localKey) {
        throw new Error('No Gemini API key available. Add one in Settings or set VITE_GEMINI_KEY in .env.local');
    }

    const response = await fetch(`${DIRECT_ENDPOINT}?key=${localKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API error (${response.status}): ${errText}`);
    }

    return await response.json();
}

/**
 * Extract text from Gemini response (handles thinking model parts)
 */
function extractTextFromResponse(data) {
    const parts = data.candidates?.[0]?.content?.parts;
    if (!parts || parts.length === 0) return null;

    // Gemini 2.5 returns "thought" parts followed by the actual text part
    for (let i = parts.length - 1; i >= 0; i--) {
        if (parts[i].text !== undefined && parts[i].text !== '') {
            return parts[i].text;
        }
    }
    return null;
}

/**
 * Generate a walk from a natural language description using Gemini + Google Search
 */
export async function generateWalkFromPrompt(userPrompt) {
    const systemPrompt = `You are an expert Lake District walking guide and route planner. Given a user's description of their ideal walk, you generate a detailed walk specification with PRECISE route waypoints in JSON format.

You must return ONLY valid JSON (no markdown, no explanation) with this exact structure:
{
    "name": "Walk name — short, evocative",
    "distance": "e.g. 3.5 km",
    "time": "e.g. 1.5 hours",
    "difficulty": "Easy | Moderate | Challenging",
    "desc": "2-3 sentence vivid description of the walk experience",
    "start": "Car park or starting location name",
    "lat": 54.XXXX,
    "lon": -2.XXXX or -3.XXXX,
    "endLat": 54.XXXX,
    "endLon": -2.XXXX or -3.XXXX,
    "elevation": "e.g. 238m or N/A for flat walks",
    "terrain": "e.g. Woodland and open fell",
    "walkType": "summit | lakeside | waterfall | heritage | woodland | ridge | village",
    "parkingDetail": "Specific car park name, postcode if known, tips",
    "thePayoff": "One evocative sentence about the wow moment of this walk",
    "isCircular": true,
    "loopWaypoints": [
        [54.XXXX, -2.XXXX],
        [54.XXXX, -2.XXXX],
        [54.XXXX, -2.XXXX],
        [54.XXXX, -2.XXXX]
    ],
    "directions": [
        {"step": 1, "instruction": "Detailed direction...", "landmark": "Notable feature"},
        {"step": 2, "instruction": "...", "landmark": "..."}
    ]
}

CRITICAL RULES FOR ROUTING:
- lat/lon is the CAR PARK (real Lake District coordinates ~54.2-54.6 lat, -2.7 to -3.3 lon)
- loopWaypoints are 4-6 intermediate points forming the ACTUAL walking loop
  - These must be on or very near real footpaths, bridleways, or tracks
  - They define the route shape — ORS will route between them on real paths
  - For circular: the walk goes CarPark → wp1 → wp2 → wp3 → wp4 → CarPark
  - For linear: the walk goes CarPark → wp1 → wp2 → wp3 → EndPoint
  - Space them to capture key turns and features (don't cluster them)
  - NEVER put waypoints on lake surfaces, cliff faces, or away from paths
- For circular walks: endLat/endLon = lat/lon (returns to car park)
- For linear walks: endLat/endLon is the finishing point
- Use ACTUAL place names, car parks, paths, landmarks that REALLY EXIST
- Directions should be 5-8 detailed steps matching the waypoint sequence
- parkingDetail should include real postcodes where possible`;

    const requestBody = {
        contents: [
            {
                role: 'user',
                parts: [{ text: systemPrompt + '\n\nUser request: ' + userPrompt }]
            }
        ],
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json'
        }
    };

    const data = await callGemini(requestBody);

    const text = extractTextFromResponse(data);
    if (!text) {
        throw new Error('Gemini returned an empty response.');
    }

    const cleanJson = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const walk = JSON.parse(cleanJson);

    if (!walk.name || !walk.lat || !walk.lon) {
        throw new Error('Gemini response missing required fields (name, lat, lon).');
    }

    return walk;
}

/**
 * Generate enriched directions for a walk that already has a route
 */
export async function generateDirections(walkName, waypoints, startName, difficulty) {
    const prompt = `You are a Lake District walking guide. Generate step-by-step directions for a walk called "${walkName}".
Starting from: ${startName}
Difficulty: ${difficulty}
Number of waypoints: ${waypoints.length}
Start coordinates: [${waypoints[0]}]
Endpoint coordinates: [${waypoints[waypoints.length - 1]}]

Return ONLY a JSON array of direction objects:
[{"step": 1, "instruction": "Detailed walking direction...", "landmark": "Notable feature"}, ...]

Generate 5-8 steps. Be specific about turns, landmarks, and features. Make directions practical and vivid.`;

    try {
        const requestBody = {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.6,
                maxOutputTokens: 2048,
                responseMimeType: 'application/json'
            },
            tools: []
        };

        const data = await callGemini(requestBody);
        const text = extractTextFromResponse(data);
        if (!text) return [];

        const cleanJson = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        return JSON.parse(cleanJson);
    } catch (e) {
        console.warn('Direction generation failed:', e);
        return [];
    }
}
