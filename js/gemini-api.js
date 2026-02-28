/* ═══════════════════════════════════════════════════════
   Gemini API — Google Generative AI client for walk generation
   ═══════════════════════════════════════════════════════ */

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

// Default key — can be overridden via settings
const DEFAULT_GEMINI_KEY = 'AIzaSyCbBg1KGryWrkL8F2wSCz_bemMbHVbwShM';

/**
 * Get stored Gemini API key
 */
export function getGeminiKey() {
    return localStorage.getItem('gemini_api_key') || DEFAULT_GEMINI_KEY;
}

/**
 * Set Gemini API key
 */
export function setGeminiKey(key) {
    localStorage.setItem('gemini_api_key', key);
}

/**
 * Generate a walk from a natural language description using Gemini
 */
export async function generateWalkFromPrompt(userPrompt) {
    const apiKey = getGeminiKey();
    if (!apiKey) {
        throw new Error('No Gemini API key set. Go to Settings to add one.');
    }

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
- lat/lon must be REAL coordinates in the Lake District (roughly 54.2-54.6 lat, -2.7 to -3.3 lon)
- Use actual place names, car parks, paths, and landmarks that exist
- For circular walks, endLat/endLon should equal lat/lon (same as start)
- For linear walks, endLat/endLon should be the finishing point
- Directions should be 5-8 detailed steps that a walker could actually follow
- The description and payoff should be evocative and make people want to do the walk
- parkingDetail should be specific and include postcodes where possible`;

    const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [
                {
                    role: 'user',
                    parts: [{ text: systemPrompt + '\n\nUser request: ' + userPrompt }]
                }
            ],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 2048,
                responseMimeType: 'application/json'
            }
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API error (${response.status}): ${errText}`);
    }

    const data = await response.json();

    // Extract the text content from Gemini response
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
        throw new Error('Gemini returned an empty response.');
    }

    // Parse JSON (clean any markdown wrapping)
    const cleanJson = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const walk = JSON.parse(cleanJson);

    // Validate essential fields
    if (!walk.name || !walk.lat || !walk.lon) {
        throw new Error('Gemini response missing required fields (name, lat, lon).');
    }

    return walk;
}

/**
 * Generate enriched directions for a walk that already has a route
 */
export async function generateDirections(walkName, waypoints, startName, difficulty) {
    const apiKey = getGeminiKey();
    if (!apiKey) return [];

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
        const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.6,
                    maxOutputTokens: 1024,
                    responseMimeType: 'application/json'
                }
            })
        });

        if (!response.ok) return [];

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) return [];

        const cleanJson = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        return JSON.parse(cleanJson);
    } catch (e) {
        console.warn('Direction generation failed:', e);
        return [];
    }
}
