/**
 * map-snapshot.js
 * Fetches a static map image of a bounding box for the LLM Vision Pipeline.
 */

// We get the key from localStorage or Vite env
function getGoogleMapsKey() {
    return localStorage.getItem('gmaps_api_key') || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_MAPS_KEY) || '';
}

export async function getStaticMapImageBase64(bbox) {
    const key = getGoogleMapsKey();
    if (!key) {
        throw new Error("No Google Maps API key available for static map snapshot.");
    }
    
    // bbox is [latMin, latMax, lonMin, lonMax]
    const [latMin, latMax, lonMin, lonMax] = bbox;
    
    // We can use the 'visible' parameter to ensure the bounding box is visible
    // or just calculate the center. 'visible' is better to perfectly fit the bbox.
    // Format: visible=lat,lng|lat,lng
    const visibleParams = `${latMin},${lonMin}|${latMax},${lonMax}`;
    
    // Use terrain map to see paths and topography better
    const url = `https://maps.googleapis.com/maps/api/staticmap?size=640x640&maptype=terrain&visible=${visibleParams}&key=${key}`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Static Maps API returned ${response.status}`);
        }
        
        // Convert to base64
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                // reader.result is like "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
                const base64data = reader.result.split(',')[1]; 
                resolve(base64data);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error("Error fetching map snapshot:", error);
        throw error;
    }
}
