/**
 * Map Snapshot Generator for Gemini Vision Input
 */

/**
 * Convert lat/lon to tile X/Y coordinates
 */
function lon2tile(lon, zoom) {
    return Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
}

function lat2tile(lat, zoom) {
    return Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
}

/**
 * Generate a static map image (base64) for a given bounding box.
 * Grabs the central tile covering the area.
 * 
 * @param {Object} bbox - {minLat, maxLat, minLon, maxLon}
 * @returns {Promise<string>} - Base64 string of the image (without data:image/png;base64, prefix)
 */
export async function fetchMapSnapshot(bbox) {
    try {
        const centerLat = (bbox.minLat + bbox.maxLat) / 2;
        const centerLon = (bbox.minLon + bbox.maxLon) / 2;
        
        // Zoom 13 is usually good for a walk (gives a good topo overview)
        const zoom = 13;
        
        const x = lon2tile(centerLon, zoom);
        const y = lat2tile(centerLat, zoom);
        
        const tileUrl = `https://tile.opentopomap.org/${zoom}/${x}/${y}.png`;
        
        const response = await fetch(tileUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch map tile: ${response.status}`);
        }
        
        const blob = await response.blob();
        
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                // The result is a data URL like: data:image/png;base64,iVBORw0KGgo...
                // We just want the base64 part for Gemini inline_data
                const base64data = reader.result.split(',')[1];
                resolve(base64data);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
        
    } catch (error) {
        console.warn('Map snapshot generation failed:', error);
        return null; // Graceful fallback
    }
}
