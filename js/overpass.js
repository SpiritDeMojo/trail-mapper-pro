/**
 * Service to query Overpass API for real OpenStreetMap data
 */
export async function fetchOSMData(areaName) {
    try {
        // 1. Resolve area to bounding box using Nominatim
        // We append "Lake District, UK" for better resolution within context
        const searchName = areaName.toLowerCase().includes('lake district') ? areaName : `${areaName}, Lake District, UK`;
        const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchName)}&format=json&limit=1`;
        
        const nominatimRes = await fetch(nominatimUrl, {
            headers: { 'User-Agent': 'TrailMapperPro/1.0' }
        });
        const nominatimData = await nominatimRes.json();
        
        if (!nominatimData || nominatimData.length === 0) {
            console.warn(`Nominatim could not find bounding box for ${areaName}`);
            return null;
        }
        
        const place = nominatimData[0];
        // Nominatim boundingbox is [latMin, latMax, lonMin, lonMax]
        const bbox = {
            minLat: parseFloat(place.boundingbox[0]),
            maxLat: parseFloat(place.boundingbox[1]),
            minLon: parseFloat(place.boundingbox[2]),
            maxLon: parseFloat(place.boundingbox[3])
        };
        
        // Overpass requires (south, west, north, east)
        const bboxStr = `${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon}`;
        
        // 2. Query Overpass API
        const overpassQuery = `
            [out:json][timeout:25];
            (
              node["amenity"="parking"]["name"](${bboxStr});
              way["amenity"="parking"]["name"](${bboxStr});
              way["highway"~"footway|path|bridleway"]["name"](${bboxStr});
              node["tourism"~"viewpoint|picnic_site|information"]["name"](${bboxStr});
              node["amenity"="cafe"]["name"](${bboxStr});
            );
            out center;
        `;
        
        const overpassUrl = 'https://overpass-api.de/api/interpreter';
        const overpassRes = await fetch(overpassUrl, {
            method: 'POST',
            body: `data=${encodeURIComponent(overpassQuery)}`,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        
        const overpassData = await overpassRes.json();
        
        // 3. Simplify result
        const result = {
            bbox: bbox,
            carParks: [],
            paths: [],
            pois: []
        };
        
        if (overpassData && overpassData.elements) {
            for (const el of overpassData.elements) {
                if (el.tags && el.tags.name) {
                    const lat = el.lat || (el.center && el.center.lat);
                    const lon = el.lon || (el.center && el.center.lon);
                    
                    if (el.tags.amenity === 'parking') {
                        result.carParks.push({ name: el.tags.name, lat, lon });
                    } else if (el.tags.highway) {
                        // For paths we return the centroid and name
                        result.paths.push({ name: el.tags.name, centroid: {lat, lon} });
                    } else {
                        const type = el.tags.tourism || el.tags.amenity;
                        result.pois.push({ name: el.tags.name, type, lat, lon });
                    }
                }
            }
        }
        
        // Deduplicate paths
        const uniquePaths = new Map();
        for (const p of result.paths) {
            if (!uniquePaths.has(p.name)) {
                uniquePaths.set(p.name, p);
            }
        }
        result.paths = Array.from(uniquePaths.values());
        
        return result;
    } catch (error) {
        console.warn('OSM data fetch failed:', error);
        return null; // Graceful fallback
    }
}
