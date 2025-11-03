# Architecture Lenses

A professional React-based single-page web application for managing and visualizing an organization's technology architecture estate through multiple lenses.

## Features

- **Nine Architecture Lenses**: Business Units, Domains, Channels, Channel Applications, Product Families, Platforms, Processes, Capabilities, and Enablers
- **Interactive Diagram**: Full-screen relationship visualization with filtering capabilities
- **Field-based Filtering**: Click any field value (Business Contact, Tech Contact, Primary/Secondary SME Architects) to filter across all lenses
- **Bidirectional Relationships**: Link items across lenses with automatic reverse relationship creation
- **Local-First Storage**: All data stored in browser's IndexedDB (no backend required)
- **Export/Import**: JSON-based data portability
- **PWA Support**: Installable Progressive Web App with offline capability
- **Gap Coverage Indicators**: Visual color coding for incomplete items

## Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### Deploy to GitHub Pages

See [GITHUB_SETUP.md](./GITHUB_SETUP.md) for complete instructions.

**Quick version:**
1. Create a GitHub repository
2. Push your code: `git push -u origin main`
3. Enable GitHub Pages in repository Settings → Pages
4. Set source to "GitHub Actions"
5. Your site will auto-deploy at: `https://YOUR_USERNAME.github.io/arch-lenses/`

## Project Structure

```
arch-lenses/
├── src/
│   ├── components/      # React components
│   ├── db.ts            # Dexie IndexedDB setup
│   ├── types.ts         # TypeScript type definitions
│   └── App.tsx          # Main application
├── public/              # Static assets
├── .github/workflows/   # GitHub Actions for auto-deployment
└── dist/                # Built files (generated)
```

## Technology Stack

- **React 19** + **TypeScript**
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Styling
- **Dexie** - IndexedDB wrapper for local storage
- **Vite PWA Plugin** - Progressive Web App support

## Development

```bash
# Development server
npm run dev

# Build
npm run build

# Preview production build
npm run preview

# Deploy to GitHub Pages (manual)
npm run deploy
```

## Data Management

- All data is stored locally in each user's browser (IndexedDB)
- No backend or server required
- Users can export/import their data via the Export/Import buttons
- Data is not shared between users or devices

## Deployment Options

1. **GitHub Pages** (Recommended) - See [GITHUB_SETUP.md](./GITHUB_SETUP.md)
2. **Netlify** - Drag & drop `dist/` folder
3. **Vercel** - Connect Git repository
4. **Any static hosting** - Upload `dist/` folder

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment options.

## License

Private project - All rights reserved
