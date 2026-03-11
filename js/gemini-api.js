/* ═══════════════════════════════════════════════════════
   Gemini API - Google Generative AI client for walk generation
   ═══════════════════════════════════════════════════════ */

import { fetchOSMData } from './overpass.js';
import { fetchMapSnapshot } from './map-snapshot.js';

const PROXY_ENDPOINT = '/api/gemini';
const DIRECT_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

/**
 * Get Gemini API key - checks localStorage first, then Vite env var for local dev
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
 * Make a Gemini API request - tries proxy (production), falls back to direct (local dev)
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
        // Proxy failed - fall through to direct call
    } catch (err) {
        // Network error (proxy doesn't exist in local dev) - fall through
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

    // Give up - throw with the original text for debugging
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
    // Step A: Extract Area and Walk Type
    const areaExtractionPrompt = `Extract the main area/location and the walk type from this user request.
Return ONLY valid JSON like this: {"area": "Grasmere", "walkType": "lakeside"}
If no specific area is mentioned, return null for area.
User request: ${userPrompt}`;

    let extractedInfo = { area: null, walkType: null };
    try {
        const extractBody = {
            contents: [{ role: 'user', parts: [{ text: areaExtractionPrompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 200, responseMimeType: 'application/json' }
        };
        const res = await callGemini(extractBody);
        const text = extractTextFromResponse(res);
        if (text) extractedInfo = sanitizeJSON(text);
    } catch (e) {
        console.warn('Area extraction failed, falling back to prompt-only:', e);
    }

    // Step B: Fetch OSM Data & Map Snapshot
    let osmData = null;
    let mapBase64 = null;

    if (extractedInfo && extractedInfo.area) {
        try {
            osmData = await fetchOSMData(extractedInfo.area);
            if (osmData && osmData.bbox) {
                mapBase64 = await fetchMapSnapshot(osmData.bbox);
            }
        } catch (e) {
            console.warn('OSM/Vision data fetch failed, continuing with prompt-only fallback:', e);
        }
    }

    let systemPrompt = `You are a seasoned Lake District walking guide, an expert in mountain terrain and safety. When creating routes, you think like a professional mountain rescue volunteer focused on realistic, safe, and scenic walks. Given a user's description of their ideal walk, generate a precise walk specification with PRECISE route waypoints in a strict JSON format.

Return ONLY valid JSON (no markdown, no explanation) following this exact structure:
{
    "name": "Walk name - short, evocative",
    "distance": "e.g., 3.5 km",
    "time": "e.g., 1.5 hours",
    "difficulty": "Easy | Moderate | Challenging",
    "desc": "2-3 sentence vivid description capturing the walk's experience, visual surroundings, and terrain",
    "start": "Car park or starting location name",
    "lat": 54.XXXX,
    "lon": -2.XXXX or -3.XXXX,
    "endLat": 54.XXXX,
    "endLon": -2.XXXX or -3.XXXX,
    "elevation": "e.g., 238m or N/A for flat walks",
    "terrain": "e.g., Woodland and open fell",
    "walkType": "summit | lakeside | waterfall | heritage | woodland | ridge | village",
    "parkingDetail": "Specific car park name, postcode if known, advice on access or parking",
    "thePayoff": "One evocative sentence highlighting the wow moment or main attraction of this walk",
    "isCircular": true,
    "loopWaypoints": [
        [54.XXXX, -2.XXXX],
        [54.XXXX, -2.XXXX],
        [54.XXXX, -2.XXXX],
        [54.XXXX, -2.XXXX]
    ],
    "directions": [
        {"step": 1, "instruction": "Detailed practical walking direction, including terrain and landmarks", "landmark": "Notable feature"},
        {"step": 2, "instruction": "...", "landmark": "..."}
    ]
}

IMPORTANT ROUTING RULES:
- Prioritize safe, well-established footpaths and bridleways over shortest or direct lines.
- NEVER route directly up steep contour lines or cliff faces; instead use longer, zig-zagging ascents that reduce incline and risk.
- Waypoints must be placed where real paths exist on solid terrain, avoiding water bodies, cliffs, or impassable areas.
- Incorporate engaging Points of Interest like viewpoints, tarns, historic sites to enrich the walk experience.
- Lat/lon corresponds to the CAR PARK location (typical Lake District coords ~54.2-54.6 lat, -2.7 to -3.3 lon).
- loopWaypoints should consist of 4-6 intermediate waypoints forming a safe, scenic loop or linear route.
  - Each waypoint must be directly on or very close to known pedestrian paths or tracks from provided OSM data.
  - Do NOT place waypoints on lake surfaces, water, or cliffs.
  - For lakeside walks, due to AI coordinate imprecision, provide only 1 or 2 well-known landmarks on solid ground; the routing engine will trace safe routes along the shoreline.
- Circular walks have matching start and end coordinates (car park location).
- Linear walks have distinct start and endpoint coordinates.
- Use actual, verified place names for car parks, paths, landmarks, and key features.
- Provide 5-8 vividly detailed step-by-step directions aligned with the waypoint sequence.
- Include real postcodes or parking advice where available.
- Always think like a mountain rescue expert assessing route safety and accessibility; exclude any paths that might be dangerous or unreliable.

Use elevation and visible satellite cues from the provided topographic map and OSM data to assist routing decisions and waypoint placement.`;

    const parts = [];

    if (osmData && mapBase64) {
        systemPrompt += `

You have been provided a topographic map image of the area AND a list of real car parks and named footpaths from OpenStreetMap. You MUST choose your starting car park and waypoints ONLY from the provided car park list. You MUST place intermediate waypoints on or beside the named footpaths provided. DO NOT invent coordinates — use the provided OSM data.

=== OSM DATA ===
CAR PARKS:
${JSON.stringify(osmData.carParks, null, 2)}

NAMED PATHS (Centroids):
${JSON.stringify(osmData.paths, null, 2)}

POIs:
${JSON.stringify(osmData.pois, null, 2)}
`;
        parts.push({
            inline_data: {
                mime_type: "image/png",
                data: mapBase64
            }
        });
    }

    parts.push({ text: systemPrompt + '\n\nUser request: ' + userPrompt });

    const requestBody = {
        contents: [
            {
                role: 'user',
                parts: parts
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
