# 🥾 Trail Mapper Pro — Lake District

**Create, explore, and share walking routes in the Lake District with real GPS trail routing and AI-powered walk generation.**

Trail Mapper Pro is a standalone web app that lets you browse a curated library of 32 Lake District walks, create new routes using real hiking trails, and generate walks from natural language using Google Gemini AI.

---

## ✨ Features

### 📚 Walk Library
Browse 32 hand-curated Lake District walks with detailed information including step-by-step directions, parking details, terrain info, and interactive topographic maps.

- Filter by difficulty (Easy, Moderate, Challenging)
- Filter by type (Summit, Lakeside, Waterfall, Heritage, Woodland, Ridge, Village)
- Full detail view with OpenTopoMap showing contour lines and footpaths
- Export any walk as compatible JSON

### 🗺️ Walk Creator
Build custom walking routes by clicking on the map:

- **Real trail routing** via OpenRouteService `foot-hiking` profile — routes follow actual footpaths, bridleways, and trails
- Circular and linear route support
- Auto-calculates distance and estimated time
- Export as JSON compatible with other walk systems

### 🤖 AI Walk Generator (Gemini)
Describe the walk you want in plain English and AI creates it:

- *"A gentle 1-hour lakeside walk suitable for families near Windermere"*
- *"A challenging 4-hour summit walk with dramatic ridge views near Langdale"*
- Gemini generates walk metadata → OpenRouteService routes the trail → AI enriches step-by-step directions
- Quick preset prompts for common walk types
- Add AI-generated walks directly to the library

### ⚙️ Tools & Settings
- **Route Audit Tool** — Batch re-route all walks using real trail GPS data
- **Import/Export** — Paste JSON to import walks, export full library
- **API Key Management** — ORS and Gemini keys stored locally in browser
- **Walk JSON Schema** — Documented format for external AI tools to generate compatible walks

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (18+)

### Install & Run
```bash
git clone https://github.com/SpiritDeMojo/trail-mapper-pro.git
cd trail-mapper-pro
npm install
npm run dev
```

The app opens at `http://localhost:5174/`

### API Keys (Pre-configured)
Both API keys are baked into the app for instant use:
- **OpenRouteService** — Real trail routing (foot-hiking profile)
- **Google Gemini** — AI walk generation

You can override these in the ⚙️ Settings panel.

---

## 🏗️ Tech Stack

| Technology | Purpose |
|---|---|
| **Vite** | Build tool & dev server |
| **Leaflet** | Interactive maps |
| **OpenTopoMap** | Topographic map tiles with contour lines |
| **OpenRouteService** | Real GPS trail routing (foot-hiking) |
| **Google Gemini AI** | Natural language walk generation |
| **Vanilla JS** | Zero-framework, fast & lightweight |

---

## 📁 Project Structure

```
trail-mapper-pro/
├── index.html          # App shell (4 views)
├── style.css           # Premium dark trail theme
├── vite.config.js      # Vite configuration
├── data/
│   └── walks.json      # 32 curated Lake District walks
└── js/
    ├── app.js           # Router & state management
    ├── library.js       # Walk library & detail view
    ├── creator.js       # Interactive route builder
    ├── ai-studio.js     # Gemini AI walk generator
    ├── settings.js      # API keys, import/export, audit
    ├── map-utils.js     # Shared Leaflet helpers
    ├── route-service.js # OpenRouteService client
    └── gemini-api.js    # Gemini API client
```

---

## 📋 Walk JSON Format

All walks use this compatible JSON schema:

```json
{
  "name": "Walk Name",
  "distance": "3.5 km",
  "time": "1.5 hours",
  "difficulty": "Easy | Moderate | Challenging",
  "desc": "Description of the walk...",
  "start": "Car Park Name",
  "lat": 54.38, "lon": -2.90,
  "endLat": 54.39, "endLon": -2.91,
  "elevation": "238m",
  "terrain": "Woodland and open fell",
  "walkType": "summit",
  "waypoints": [[54.38, -2.90], ...],
  "directions": [{"step": 1, "instruction": "...", "landmark": "..."}],
  "parkingDetail": "Car park details...",
  "thePayoff": "The wow moment..."
}
```

---

## 🌐 Deployment

This is a static Vite app — deploy anywhere:

```bash
npm run build    # Outputs to dist/
```

Deployed on **Vercel** with zero configuration.

---

## 📄 License

MIT
