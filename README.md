# Architecture Lenses

A professional React-based single-page web application for managing and visualizing an organization's technology architecture estate through multiple lenses.

## Overview

Architecture Lenses provides a comprehensive platform for:
- **Managing Architecture Items** across multiple dynamic lenses (Business Units, Domains, Channels, Applications, Product Families, Platforms, Processes, Capabilities, Enablers, and custom lenses)
- **Visualizing Relationships** between architecture items in an interactive diagram
- **Tracking Team Members** including architects and stakeholders with coverage analysis
- **Capturing Meeting Notes** with rich text formatting and task management
- **Managing Tasks** independently or linked to meeting notes, people, or architecture items

**Key Features:**
- **Local-First Architecture**: All data stored in browser's IndexedDB (no backend required)
- **Progressive Web App**: Installable, works offline, auto-updates
- **Selective Export/Import**: Choose what data to export/import (Lenses, People, Notes, or All)
- **Rich Text Editing**: Full formatting support for meeting notes (bold, italic, lists, tables, links)
- **Interactive Visualizations**: Multiple view modes for architecture relationship diagram
- **Comprehensive Filtering**: Filter by team type, manager, tags, lifecycle status, and more

> 📋 **For complete system specification**, see [SPECIFICATION.md](./specification.md)

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
│   │   ├── Navigation.tsx      # Top navigation
│   │   ├── LensPanel.tsx      # Lens item lists
│   │   ├── GraphModal.tsx     # Architecture diagram
│   │   ├── TeamModal.tsx      # Team structure view
│   │   ├── TeamManager.tsx    # Team management
│   │   ├── MeetingNotesModal.tsx # Notes view
│   │   └── ...                 # Other components
│   ├── db.ts            # Dexie IndexedDB setup
│   ├── types.ts          # TypeScript type definitions
│   └── App.tsx           # Main application router
├── public/               # Static assets
├── .github/workflows/    # GitHub Actions for auto-deployment
├── specification.md       # Complete system specification
└── dist/                 # Built files (generated)
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

- **Local Storage**: All data stored in browser's IndexedDB (Dexie.js)
- **No Backend**: Completely client-side application
- **Data Portability**: Export/Import functionality with selective data types
  - Export: Choose All, Lenses, People, or Notes
  - Import: Selectively replace data types (replaces, not merges)
- **Privacy**: Data never leaves the user's browser
- **Isolation**: Each user/browser has separate data store

### Data Model

The system manages:
- **Lenses**: Dynamic architecture lens definitions
- **Items**: Architecture items with attributes (description, lifecycle, contacts, architects, tags, etc.)
- **Relationships**: Bidirectional links between items across lenses
- **Team Members**: People categorized as Architecture, Business Stakeholder, or Tech Stakeholder
- **Meeting Notes**: Rich text notes with participants, date/time, and related items
- **Tasks**: Action items that can be linked to notes, people, or architecture items

See [specification.md](./specification.md) for complete data model documentation.

## Deployment Options

1. **GitHub Pages** (Recommended) - See [GITHUB_SETUP.md](./GITHUB_SETUP.md)
2. **Netlify** - Drag & drop `dist/` folder
3. **Vercel** - Connect Git repository
4. **Any static hosting** - Upload `dist/` folder

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment options.

## Documentation

- **[SPECIFICATION.md](./specification.md)**: Complete system specification including:
  - Functional requirements (REQ-*)
  - Data model specification
  - User interface specification
  - Technical architecture
  - Deployment specification
- **[DEPLOYMENT.md](./DEPLOYMENT.md)**: Detailed deployment options and instructions

## License

Private project - All rights reserved
