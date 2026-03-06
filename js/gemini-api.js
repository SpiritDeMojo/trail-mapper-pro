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
 * Sanitise JSON strings that Gemini sometimes returns with minor formatting issues
 * (trailing commas, markdown fences, unquoted short values)
 */
function sanitizeJSON(raw) {
    let s = raw
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

    // Remove trailing commas before } or ]
    s = s.replace(/,\s*([}\]])/g, '$1');

    // First try a straight parse
    try { return JSON.parse(s); } catch (_) { /* fall through */ }

    // Try extracting just the JSON object/array
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
        const sub = s.slice(start, end + 1).replace(/,\s*([}\]])/g, '$1');
        try { return JSON.parse(sub); } catch (_) { /* fall through */ }
    }

    // Array variant
    const arrStart = s.indexOf('[');
    const arrEnd = s.lastIndexOf(']');
    if (arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart) {
        const sub = s.slice(arrStart, arrEnd + 1).replace(/,\s*([}\]])/g, '$1');
        try { return JSON.parse(sub); } catch (_) { /* fall through */ }
    }

    // Give up — throw with the original text for debugging
    throw new SyntaxError('Could not parse Gemini response as JSON: ' + s.slice(0, 200));
}

/**
 * Extract text from Gemini response (handles thinking model parts)
 */
function escapeXSS(obj) { if (typeof obj === 'string') { return obj.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); } else if (Array.isArray(obj)) { return obj.map(escapeXSS); } else if (obj !== null && typeof obj === 'object') { const newObj = {}; for (const key in obj) { newObj[key] = escapeXSS(obj[key]); } return newObj; } return obj; }

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
- Prioritize safe, established paths over the absolute shortest route.
- NEVER route straight up a steep contour line or cliff face. Always use longer, zig-zagging routes if it reduces incline and increases safety.
- Include waypoints that act as 'Points of Interest' (e.g., viewpoints, tarns, historical ruins) to create a more engaging, meandering walk.
- lat/lon is the CAR PARK (real Lake District coordinates ~54.2-54.6 lat, -2.7 to -3.3 lon)
- loopWaypoints are 4-6 intermediate points forming the ACTUAL safe walking loop.
  - These must be on or very near real footpaths, bridleways, or tracks on SOLID GROUND.
  - Space them to capture key turns, safe ascents, and features.
  - NEVER put waypoints on lake surfaces, over water, or on cliff faces. Waypoints MUST be on known pedestrian paths and solid ground ONLY.
  - FOR LAKESIDE WALKS: "Lakeside" means tracing the land perimeter of the water. Do not generate straight lines across lakes or tarns. All coordinates must be on the shore or surrounding paths.
  - If routing around a lake, provide waypoints that follow the curve of the shoreline paths to prevent OpenRouteService from attempting a direct water crossing.
  - They define the route shape — ORS will route between them on real paths.
  - For circular: the walk goes CarPark → wp1 → wp2 → wp3 → wp4 → CarPark
  - For linear: the walk goes CarPark → wp1 → wp2 → wp3 → EndPoint
- For circular walks: endLat/endLon = lat/lon (returns to car park)
- For linear walks: endLat/endLon is the finishing point
- Use ACTUAL place names, car parks, paths, landmarks that REALLY EXIST
- Directions should be 5-8 detailed steps matching the waypoint sequence
- parkingDetail should include real postcodes where possible
- Think like a mountain rescue volunteer: if a route looks dangerous on the ground, don't recommend it`;

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

    const walk = escapeXSS(sanitizeJSON(text));

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

        return escapeXSS(sanitizeJSON(text));
    } catch (e) {
        console.warn('Direction generation failed:', e);
        return [];
    }
}
