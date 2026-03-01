/**
 * GPX-to-JSON Importer
 * 
 * Reads .gpx files from the gpx_files/ folder and injects their verified
 * trackpoint data into walks.json as the waypoints array.
 * 
 * Usage:
 *   1. Create a gpx_files/ folder at the project root
 *   2. Download GPX files and name them exactly as the walk name (e.g., Catbells.gpx)
 *   3. Run: node scripts/gpx-to-json.cjs
 */

const fs = require('fs');
const path = require('path');

const walksPath = path.join(__dirname, '..', 'public', 'data', 'walks.json');
const gpxFolder = path.join(__dirname, '..', 'gpx_files');

// Check gpx_files folder exists
if (!fs.existsSync(gpxFolder)) {
    console.log('📁 Creating gpx_files/ folder...');
    fs.mkdirSync(gpxFolder, { recursive: true });
    console.log('📂 Place your .gpx files in:', gpxFolder);
    console.log('   Name them exactly as the walk name, e.g. "Catbells.gpx"');
    process.exit(0);
}

const walks = JSON.parse(fs.readFileSync(walksPath, 'utf8'));
let updated = 0;
let skipped = 0;

walks.forEach(walk => {
    const gpxFile = path.join(gpxFolder, `${walk.name}.gpx`);

    if (fs.existsSync(gpxFile)) {
        const gpxData = fs.readFileSync(gpxFile, 'utf8');

        // Extract all <trkpt lat="..." lon="..."> coordinates
        const waypoints = [];
        const regex = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"/g;
        let match;

        while ((match = regex.exec(gpxData)) !== null) {
            waypoints.push([parseFloat(match[1]), parseFloat(match[2])]);
        }

        if (waypoints.length > 0) {
            walk.waypoints = waypoints;
            updated++;
            console.log(`✅ Loaded ${waypoints.length} verified GPX points for ${walk.name}`);
        } else {
            console.log(`⚠️  No trackpoints found in ${walk.name}.gpx`);
        }
    } else {
        skipped++;
        console.log(`⚠️  No GPX file found for: ${walk.name}`);
    }
});

fs.writeFileSync(walksPath, JSON.stringify(walks, null, 2) + '\n');
console.log(`\n📊 Results: ${updated} walks updated, ${skipped} skipped`);
console.log('✅ Finished updating walks.json with real GPX data.');
