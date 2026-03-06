/**
 * overpass.js
 * Queries OpenStreetMap (via Nominatim and Overpass API) for car parks and footpaths in a given area.
 */

export async function fetchAreaOSMData(areaName) {
    try {
        // 1. Get bounding box from Nominatim
        // We add "Lake District" to prioritize local results if user just types "Grasmere"
        const searchQuery = areaName.toLowerCase().includes('lake district') 
            ? areaName 
            : `${areaName}, Lake District, UK`;
            
        const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=1`;
        
        const nomRes = await fetch(nominatimUrl, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'TrailMapperPro/1.0 (VisionPipeline)'
            }
        });
        
        if (!nomRes.ok) throw new Error(`Nominatim error: ${nomRes.status}`);
        const nomData = await nomRes.json();
        
        if (!nomData || nomData.length === 0) {
            throw new Error(`Area not found: ${areaName}`);
        }
        
        const location = nomData[0];
        // Nominatim boundingbox is [lat_min, lat_max, lon_min, lon_max]
        const [latMin, latMax, lonMin, lonMax] = location.boundingbox.map(Number);
        
        // 2. Query Overpass API for car parks and paths within this bounding box
        // Overpass bbox format is (south, west, north, east) -> (latMin, lonMin, latMax, lonMax)
        const overpassQuery = `
            [out:json][timeout:25];
            (
                node["amenity"="parking"](${latMin},${lonMin},${latMax},${lonMax});
                way["highway"~"path|footway|track"](${latMin},${lonMin},${latMax},${lonMax});
            );
            out body;
            >;
            out skel qt;
        `;
        
        const overpassUrl = 'https://overpass-api.de/api/interpreter';
        const overpassRes = await fetch(overpassUrl, {
            method: 'POST',
            body: overpassQuery
        });
        
        if (!overpassRes.ok) throw new Error(`Overpass error: ${overpassRes.status}`);
        const overpassData = await overpassRes.json();
        
        // 3. Process the data into a readable text format for the LLM
        let carParks = [];
        let paths = [];
        
        for (const el of overpassData.elements) {
            if (el.type === 'node' && el.tags && el.tags.amenity === 'parking') {
                const name = el.tags.name || 'Unnamed Car Park';
                carParks.push(`Car Park: ${name} (Lat: ${el.lat}, Lon: ${el.lon})`);
            } else if (el.type === 'way' && el.tags && el.tags.highway) {
                const name = el.tags.name || `Unnamed ${el.tags.highway}`;
                // Just listing the paths, maybe roughly where they are if possible, 
                // but nodes aren't fully resolved easily without walking the refs.
                // Just giving the names is helpful for the LLM to know they exist.
                if (el.tags.name) {
                    paths.push(`Path: ${name} (${el.tags.highway})`);
                }
            }
        }
        
        // Deduplicate paths
        paths = [...new Set(paths)];
        
        return {
            bbox: [latMin, latMax, lonMin, lonMax],
            center: { lat: location.lat, lon: location.lon },
            textData: `OSM Data for ${areaName}:\n\nCAR PARKS:\n${carParks.join('\n')}\n\nNAMED PATHS:\n${paths.join('\n')}`
        };
        
    } catch (error) {
        console.error("Error fetching OSM data:", error);
        throw error;
    }
}
