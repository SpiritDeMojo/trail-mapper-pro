import { rateLimit } from './rateLimiter.js';

export default async function handler(req, res) {
    // Restrict CORS - only allow same-origin or localhost for dev
    const origin = req.headers.origin || '';
    if (origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('vercel.app')) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    } else if (origin) {
        return res.status(403).json({ error: 'Origin not allowed' });
    }

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Payload Sanitization
    if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ error: 'Invalid payload' });
    }

    const { coordinates, radiuses, preference, instructions, elevation, options } = req.body;

    if (!coordinates || !Array.isArray(coordinates)) {
        return res.status(400).json({ error: 'Missing or invalid coordinates' });
    }

    // Enforce reasonable limits to prevent abuse
    if (coordinates.length > 50) {
        return res.status(400).json({ error: 'Too many coordinates' });
    }

    const safeBody = {
        coordinates,
        radiuses,
        preference: preference || 'recommended',
        instructions: !!instructions,
        elevation: !!elevation,
        options: options || undefined
    };

    // Rate limiting key on IP address
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const limitResult = await rateLimit(ip, 10, 60000); // 10 req/min
    if (!limitResult.allowed) {
        return res.status(429).json({ error: 'Too many requests' });
    }

    const ORS_KEY = process.env.ORS_API_KEY;
    if (!ORS_KEY) return res.status(500).json({ error: 'ORS API key not configured' });

    const ORS_ENDPOINT = 'https://api.openrouteservice.org/v2/directions/foot-hiking/geojson';

    try {
        const response = await fetch(ORS_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': ORS_KEY
            },
            body: JSON.stringify(safeBody)
        });

        const data = await response.json();
        if (!response.ok) return res.status(response.status).json(data);
        return res.status(200).json(data);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
