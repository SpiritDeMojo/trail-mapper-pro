/* ═══════════════════════════════════════════════════════
   Gemini API — Google Generative AI client for walk generation
   ═══════════════════════════════════════════════════════ */

// In production, requests go through /api/gemini serverless proxy (keys stay server-side)
// In local dev, falls back to direct API call if a key is set in settings
const PROXY_ENDPOINT = '/api/gemini';
const DIRECT_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

/**
 * Get stored Gemini API key (only used for local dev fallback)
 */
export function getGeminiKey() {
    return localStorage.getItem('gemini_api_key') || '';
}

/**
 * Set Gemini API key
 */
export function setGeminiKey(key) {
    localStorage.setItem('gemini_api_key', key);
}

/**
 * Make a Gemini API request — uses proxy in production, direct key in local dev
 */
async function callGemini(requestBody) {
    // Try serverless proxy first (production)
    try {
        const proxyRes = await fetch(PROXY_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (proxyRes.ok) {
            return await proxyRes.json();
        }

        // If proxy returns 500 (no key configured) and we have a local key, fall back
        const localKey = getGeminiKey();
        if (proxyRes.status === 500 && localKey) {
            return await callGeminiDirect(requestBody, localKey);
        }

        const errText = await proxyRes.text();
        throw new Error(`Gemini API error (${proxyRes.status}): ${errText}`);
    } catch (err) {
        // Network error on proxy (local dev without Vercel) — try direct
        const localKey = getGeminiKey();
        if (localKey) {
            return await callGeminiDirect(requestBody, localKey);
        }
        throw err;
    }
}

/**
 * Direct Gemini API call (local dev fallback only)
 */
async function callGeminiDirect(requestBody, apiKey) {
    const response = await fetch(`${DIRECT_ENDPOINT}?key=${apiKey}`, {
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
 * Generate a walk from a natural language description using Gemini
 */
export async function generateWalkFromPrompt(userPrompt) {
    const systemPrompt = `You are an expert Lake District walking guide. Given a user's description of their ideal walk, you generate a detailed walk specification in JSON format.

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
    "destinationLat": 54.XXXX,
    "destinationLon": -2.XXXX or -3.XXXX,
    "elevation": "e.g. 238m or N/A for flat walks",
    "terrain": "e.g. Woodland and open fell",
    "walkType": "summit | lakeside | waterfall | heritage | woodland | ridge | village",
    "parkingDetail": "Specific car park name, postcode if known, tips",
    "thePayoff": "One evocative sentence about the wow moment of this walk",
    "directions": [
        {"step": 1, "instruction": "Detailed direction...", "landmark": "Notable feature"},
        {"step": 2, "instruction": "...", "landmark": "..."}
    ],
    "isCircular": true
}

IMPORTANT RULES:
- lat/lon is the CAR PARK starting point (real coordinates in the Lake District, ~54.2-54.6 lat, -2.7 to -3.3 lon)
- destinationLat/destinationLon is the MAIN FEATURE of the walk (the summit, waterfall, tarn, viewpoint etc.) — this must be a DIFFERENT point from the car park
- For circular walks: endLat/endLon = lat/lon (returns to car park). destinationLat/destinationLon is the summit/feature
- For linear walks: endLat/endLon is the finishing point, destinationLat/destinationLon is the main feature
- Use ACTUAL place names, car parks, paths, and landmarks that REALLY EXIST
- Directions should be 5-8 detailed steps a walker could actually follow
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
        },
        tools: [{ googleSearchRetrieval: {} }]
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
            tools: [{ googleSearchRetrieval: {} }]
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
