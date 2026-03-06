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
    
    // Ensure we are passing contents structure correctly, preventing injection of weird fields
    const safeBody = {
        contents: req.body.contents,
        generationConfig: req.body.generationConfig
    };

    if (!safeBody.contents || !Array.isArray(safeBody.contents)) {
        return res.status(400).json({ error: 'Missing or invalid contents' });
    }

    // further strict check
    let promptLength = 0;
    try {
        promptLength = safeBody.contents[0].parts[0].text.length;
    } catch (e) {
        return res.status(400).json({ error: 'Invalid content parts' });
    }

    if (promptLength > 20000) {
        return res.status(400).json({ error: 'Payload too large' });
    }

    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_KEY) return res.status(500).json({ error: 'Gemini API key not configured' });

    const MODEL = 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(safeBody)
        });

        const data = await response.json();
        if (!response.ok) return res.status(response.status).json(data);
        return res.status(200).json(data);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
