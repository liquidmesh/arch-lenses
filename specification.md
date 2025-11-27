# Architecture Lenses - System Specification

## 1. System Overview

**Architecture Lenses** is a single-page web application (SPA) for managing and visualizing an organization's technology architecture estate through multiple architectural lenses. The system provides comprehensive tools for tracking architecture items, team members, relationships, and meeting notes with full local-first data storage.

### 1.1 Core Principles
- **Local-First**: All data stored in browser's IndexedDB (no backend required)
- **Progressive Web App**: Installable, works offline, auto-updates
- **Data Portability**: Full export/import capabilities with selective data types
- **User Privacy**: Data never leaves the user's browser

### 1.2 Technology Stack
- **Frontend Framework**: React 19 with TypeScript
- **Build Tool**: Vite 7
- **Styling**: Tailwind CSS 4
- **Data Storage**: Dexie.js (IndexedDB wrapper)
- **Rich Text Editor**: Tiptap
- **PWA**: Vite PWA Plugin

---

## 2. Functional Requirements

### 2.1 Architecture Lens Management

#### 2.1.1 Lens Definition
- **REQ-LENS-001**: System supports dynamic architecture lenses (not hardcoded)
- **REQ-LENS-002**: Each lens has:
  - Unique key (string identifier)
  - Display label
  - Order (for display sequence)
- **REQ-LENS-003**: Default lenses provided: Business Units, Domains, Channels, Applications, Product Families, Platforms, Processes, Capabilities, Enablers
- **REQ-LENS-004**: Users can create new lenses via "Manage Lenses" view
- **REQ-LENS-005**: Users can edit lens names
- **REQ-LENS-006**: Users can reorder lenses (affects display order in all views)
- **REQ-LENS-007**: Users can show/hide lenses in the main view

#### 2.1.2 Lens Items
- **REQ-ITEM-001**: Each item belongs to exactly one lens
- **REQ-ITEM-002**: Item name must be unique within its lens
- **REQ-ITEM-003**: Items can have the following attributes:
  - Name (required, unique within lens)
  - Description (rich text)
  - Lifecycle Status: Plan, Emerging, Invest, Divest, Stable
  - Business Contact (person name)
  - Tech Contact (person name)
  - Primary Architect (person name)
  - Secondary Architects (array of person names)
  - Tags (array of strings)
  - Skills Gaps (text)
  - Parent (string, for grouping items)
  - Hyperlinks (array of {label, url} objects)
- **REQ-ITEM-004**: Items can be created, edited, and deleted
- **REQ-ITEM-005**: When deleting an item, all relationships pointing to it are automatically deleted

### 2.2 Relationships

#### 2.2.1 Relationship Management
- **REQ-REL-001**: Items can be linked across different lenses
- **REQ-REL-002**: Relationships are bidirectional (automatically creates reverse relationship)
- **REQ-REL-003**: Relationships can be created from item detail view
- **REQ-REL-004**: Relationships are displayed in both items' detail views
- **REQ-REL-005**: Deleting an item deletes all its relationships

### 2.3 Architecture Relationship Diagram

#### 2.3.1 Visualization Views
- **REQ-DIAGRAM-001**: Full-screen interactive diagram showing all items across lenses
- **REQ-DIAGRAM-002**: Four view modes:
  - **Architecture Coverage**: Color-coded by coverage status
    - Red: Has skills gap OR (no primary architect AND no secondary architects)
    - Orange: No skills gap AND has secondary architects BUT no primary architect
    - Blue: Normal (has primary architect)
  - **Tags**: Color-coded by first tag value
  - **Summary**: Color-coded by lifecycle status
    - Grey: Plan
    - Yellow: Emerging
    - Blue: Stable (default)
    - Red: Invest
    - Grey: Divest
  - **Tasks**: Color-coded by open task count
    - Green: 0 open tasks
    - Orange: 1 open task
    - Red: 2+ open tasks
- **REQ-DIAGRAM-003**: Layout modes:
  - Columns: Items arranged in vertical columns by lens
  - Rows: Items arranged in horizontal rows by lens
- **REQ-DIAGRAM-004**: Parent grouping:
  - Items with same parent can be grouped in parent boxes
  - Toggle to show/hide parent boxes
  - When hidden, all items shown in flat list
- **REQ-DIAGRAM-005**: Zoom control (persisted in localStorage)
- **REQ-DIAGRAM-006**: View settings persisted in localStorage (layout mode, view mode, zoom, parent boxes)
- **REQ-DIAGRAM-007**: Hover interaction:
  - Shows relationship lines to related items
  - Highlights related items with thicker borders
- **REQ-DIAGRAM-008**: Click interaction:
  - Click item name to edit item
  - Click item box to select (freezes relationship highlighting)
  - Selected item shows filter icon to "show only related items"
- **REQ-DIAGRAM-009**: Field-based filtering:
  - Click any field value (Business Contact, Tech Contact, Primary/Secondary Architects) to filter across all lenses
- **REQ-DIAGRAM-010**: Task display in Tasks view:
  - Shows item name
  - For 1-2 open tasks: displays task descriptions
  - For 3+ open tasks: displays "{count} open tasks"

### 2.4 People Management

#### 2.4.1 Team Member Management
- **REQ-PEOPLE-001**: Team members can be categorized as:
  - Architecture (default)
  - Business Stakeholder
  - Tech Stakeholder
- **REQ-PEOPLE-002**: Each team member has:
  - Name (required, unique)
  - Manager (optional, person name)
  - Team type (Architecture, Business Stakeholder, or Tech Stakeholder)
- **REQ-PEOPLE-003**: Team members can be created, edited, and deleted
- **REQ-PEOPLE-004**: "Manage Team" view provides:
  - Searchable list of all team members
  - Filter by team type (All, Architecture, Business Stakeholder, Tech Stakeholder)
  - Edit form for selected member
  - Display of related architecture items
  - Display of referenced meeting notes
  - Display of assigned tasks with completion controls

#### 2.4.2 Team Structure View
- **REQ-TEAM-001**: "People" view shows team structure with filters:
  - Team filter: Architecture, Business Stakeholders, Tech Stakeholders, All Stakeholders
  - Manager filter: All, Unassigned, or specific manager name
- **REQ-TEAM-002**: Architecture team view:
  - Groups people by manager
  - Sub-groups by coverage level (High, Medium, Low, No Coverage)
  - Shows primary and secondary items for each person
  - Shows team items (items where direct reports are architects)
  - Shows "Skills Needed" box listing items with skills gaps
  - Color coding removed (white background for all)
- **REQ-TEAM-003**: Stakeholder view:
  - Groups by stakeholder type (Business, Tech, or Both)
  - Shows related architecture items with primary SME architect name
  - No coverage classification
  - Shows outstanding tasks from meetings where stakeholder was a participant
- **REQ-TEAM-004**: Click person name to edit person details
- **REQ-TEAM-005**: All people lists sorted alphabetically

### 2.5 Meeting Notes

#### 2.5.1 Note Management
- **REQ-NOTE-001**: Each meeting note has:
  - Title (required)
  - Participants (comma-separated list of person names)
  - Date and time (UTC timestamp, displayed in local time)
  - Content (rich text with formatting: bold, italic, lists, tables, links, font size)
  - Related architecture lens items (array of item IDs)
- **REQ-NOTE-002**: Notes can be created, edited, and deleted
- **REQ-NOTE-003**: Notes displayed in list ordered by date (newest first)
- **REQ-NOTE-004**: Notes view layout:
  - Left panel: List of notes (title and date/time)
  - Right panel: Selected note details (full content, participants, tasks, related items)
- **REQ-NOTE-005**: Search functionality for notes and tasks

#### 2.5.2 Task Management
- **REQ-TASK-001**: Tasks can be:
  - Created as part of a meeting note
  - Created standalone (not associated with a meeting note)
- **REQ-TASK-002**: Each task has:
  - Description (required)
  - Assigned To (optional, person name)
  - Related Architecture Lens Items (array of item IDs)
  - Completion status (completedAt timestamp)
  - Meeting Note ID (optional, if created from a note)
- **REQ-TASK-003**: Tasks can be:
  - Created
  - Edited
  - Completed (toggle completion with timestamp)
  - Deleted
- **REQ-TASK-004**: Task display:
  - Open tasks shown before completed tasks
  - Newest tasks shown first within each group
  - Shows task description, assigned person, related items, and link to meeting note (if applicable)
- **REQ-TASK-005**: Tasks can be created from:
  - Meeting note view
  - Person edit view
  - Architecture lens item edit view

### 2.6 Data Export/Import

#### 2.6.1 Export
- **REQ-EXPORT-001**: Export dialog allows selection of data types:
  - All (everything)
  - Lenses (items and relationships)
  - People (team members)
  - Notes (meeting notes and tasks)
- **REQ-EXPORT-002**: Export creates JSON file with selected data
- **REQ-EXPORT-003**: Export includes metadata (version, export timestamp)

#### 2.6.2 Import
- **REQ-IMPORT-001**: Import dialog shows available data types in file
- **REQ-IMPORT-002**: User can select which data types to import (checkboxes)
- **REQ-IMPORT-003**: Import behavior: **REPLACES** (not merges) selected data types
- **REQ-IMPORT-004**: Only selected data types are cleared and replaced
- **REQ-IMPORT-005**: Confirmation dialog shows which data types will be replaced
- **REQ-IMPORT-006**: Import validates file format before proceeding

---

## 3. Data Model Specification

### 3.1 Database Schema (IndexedDB via Dexie)

#### 3.1.1 Lenses Table
```typescript
interface LensDefinition {
  id?: number;              // Auto-increment primary key
  key: string;              // Unique lens identifier
  label: string;            // Display name
  order: number;            // Display order
  createdAt: number;        // UTC timestamp
  updatedAt: number;        // UTC timestamp
}
```
**Indexes**: `++id, key, order, updatedAt`

#### 3.1.2 Items Table
```typescript
interface ItemRecord {
  id?: number;                      // Auto-increment primary key
  lens: string;                     // Foreign key to lens
  name: string;                     // Unique within lens
  description?: string;              // Rich text (HTML)
  lifecycleStatus?: LifecycleStatus; // Plan | Emerging | Invest | Divest | Stable
  businessContact?: string;          // Person name
  techContact?: string;              // Person name
  primaryArchitect?: string;        // Person name
  secondaryArchitects: string[];     // Array of person names
  tags: string[];                   // Array of tag strings
  skillsGaps?: string;              // Text description
  parent?: string;                  // Parent group name
  hyperlinks?: Hyperlink[];         // Array of {label, url}
  createdAt: number;                // UTC timestamp
  updatedAt: number;                // UTC timestamp
}
```
**Indexes**: `++id, &[lens+name], lens, name, updatedAt, parent`
**Constraints**: `[lens+name]` must be unique

#### 3.1.3 Relationships Table
```typescript
interface RelationshipRecord {
  id?: number;           // Auto-increment primary key
  fromLens: string;      // Source lens key
  fromItemId: number;    // Source item ID
  toLens: string;        // Target lens key
  toItemId: number;      // Target item ID
  createdAt: number;     // UTC timestamp
}
```
**Indexes**: `++id, fromLens, fromItemId, toLens, toItemId`

#### 3.1.4 Team Members Table
```typescript
interface TeamMember {
  id?: number;                    // Auto-increment primary key
  name: string;                   // Unique person name
  manager?: string;               // Person name (self-reference)
  team?: TeamType;                // Architecture | Business Stakeholder | Tech Stakeholder
  createdAt: number;              // UTC timestamp
  updatedAt: number;              // UTC timestamp
}
```
**Indexes**: `++id, name, manager, team, updatedAt`

#### 3.1.5 Meeting Notes Table
```typescript
interface MeetingNote {
  id?: number;              // Auto-increment primary key
  title: string;            // Note title
  participants: string;     // Comma-separated person names
  dateTime: number;        // UTC timestamp
  content: string;          // Rich text (HTML)
  relatedItems?: number[];  // Array of item IDs
  createdAt: number;       // UTC timestamp
  updatedAt: number;       // UTC timestamp
}
```
**Indexes**: `++id, dateTime, createdAt, updatedAt`

#### 3.1.6 Tasks Table
```typescript
interface Task {
  id?: number;                  // Auto-increment primary key
  meetingNoteId?: number;        // Optional foreign key to meeting note
  description: string;           // Task description
  assignedTo?: string;          // Person name
  itemReferences: number[];      // Array of item IDs
  completedAt?: number;         // UTC timestamp (undefined if not completed)
  createdAt: number;            // UTC timestamp
  updatedAt: number;            // UTC timestamp
}
```
**Indexes**: `++id, meetingNoteId, assignedTo, completedAt, createdAt, updatedAt`

### 3.2 Export Bundle Format
```typescript
type ExportBundle = {
  version: 1;
  exportedAt: string;           // ISO 8601 timestamp
  items: ItemRecord[];
  relationships: RelationshipRecord[];
  teamMembers?: TeamMember[];
  meetingNotes?: MeetingNote[];
  tasks?: Task[];
};
```

---

## 4. User Interface Specification

### 4.1 Navigation Structure

#### 4.1.1 Top Navigation Bar
- **Architecture Lenses**: Main view with lens panels
- **Architecture Relationship Diagram**: Full-screen diagram view
- **People**: Team structure view (replaces separate Architecture Team/Stakeholders)
- **Manage Team**: Team member management
- **Notes**: Meeting notes view
- **Manage Lenses**: Lens definition management

### 4.2 Main View (Architecture Lenses)

#### 4.2.1 Layout
- Left sidebar: Lens visibility controls and reordering
- Main area: Grid of lens panels (one per visible lens)
- Header: Global search, Export/Import buttons

#### 4.2.2 Lens Panel
- Shows all items in the lens
- Searchable/filterable by global search query
- Each item shows:
  - Name (clickable to edit)
  - Description (if present)
  - Related items (from other lenses)
  - Related notes (with links)
  - Related tasks (with links)
- Add button to create new item

### 4.3 Architecture Relationship Diagram

#### 4.3.1 Header Controls
- View mode dropdown: Architecture coverage, Tags, Summary, Tasks
- Layout toggle: Columns / Rows
- Parent boxes toggle: Show/Hide
- Zoom control: Slider or buttons
- Instructions: Hover/click guidance (appears after 1 second delay)

#### 4.3.2 Item Display
- Each item shown as a box with:
  - Name (clickable to edit)
  - View-specific content:
    - Summary: Description, business contact, tech contact, primary/secondary architects (on hover/click)
    - Tasks: Task names (1-2) or count (3+)
    - Tags: Tag values
    - Coverage: Visual color only
- Filter icon on selected items (top-right corner)

### 4.4 People View

#### 4.4.1 Filters
- Team filter: Architecture, Business Stakeholders, Tech Stakeholders, All Stakeholders
- Manager filter: All, Unassigned, or specific manager

#### 4.4.2 Display
- Grouped by manager (or stakeholder type)
- Each person shown as a box with:
  - Name (clickable to edit)
  - Coverage indicators (for architecture team)
  - Related items (grouped by lens, alphabetically sorted)
  - Outstanding tasks (for stakeholders)

### 4.5 Manage Team View

#### 4.5.1 Layout
- Left panel: Searchable, filterable list of team members
- Right panel: Edit form for selected member

#### 4.5.2 Filters
- Team type filter: All, Architecture, Business Stakeholder, Tech Stakeholder
- Name search: Filters by name or manager

### 4.6 Notes View

#### 4.6.1 Layout
- Left panel: List of notes (title, date/time)
- Right panel: Selected note details

#### 4.6.2 Note Display
- Title
- Date/time (local format)
- Participants (with links to person view)
- Content (formatted rich text)
- Tasks (with completion toggles)
- Related architecture items (with links)

---

## 5. Technical Architecture

### 5.1 Component Structure

```
src/
├── App.tsx                 # Main application router and state management
├── types.ts                # TypeScript type definitions
├── db.ts                   # Database initialization and utilities
├── main.tsx                # Application entry point
├── components/
│   ├── Navigation.tsx      # Top navigation bar
│   ├── Sidebar.tsx         # Lens visibility controls
│   ├── LensPanel.tsx      # Individual lens item list
│   ├── ItemDialog.tsx      # Item create/edit form
│   ├── GraphModal.tsx      # Architecture relationship diagram
│   ├── TeamModal.tsx       # Team structure visualization
│   ├── TeamManager.tsx     # Team member management
│   ├── MeetingNotesModal.tsx # Meeting notes list and detail
│   ├── MeetingNoteDialog.tsx # Meeting note create/edit form
│   ├── TaskDialog.tsx      # Task create/edit form
│   ├── LensManager.tsx     # Lens definition management
│   ├── Modal.tsx           # Reusable modal component
│   └── AutocompleteInput.tsx # Type-ahead input component
└── utils/
    └── lensOrder.ts        # Lens ordering utilities
```

### 5.2 State Management
- React hooks (`useState`, `useEffect`, `useMemo`)
- Local state in components
- IndexedDB for persistent data
- localStorage for UI preferences (view settings, lens order)

### 5.3 Data Flow
1. User actions trigger component state updates
2. Components call database functions (via `db.ts`)
3. Database updates trigger component re-renders
4. Cross-component communication via props and custom events

### 5.4 Custom Events
- `lensesUpdated`: Dispatched when lenses are created/edited/deleted
- `openMeetingNote`: Dispatched to open meeting note from other views

---

## 6. Data Persistence

### 6.1 Storage Strategy
- **Primary**: IndexedDB (via Dexie.js)
- **Secondary**: localStorage (UI preferences only)
- **No backend**: All data stored locally in browser

### 6.2 Database Versioning
- Current version: 11
- Automatic migrations on version upgrade
- Backward compatibility maintained

### 6.3 Data Isolation
- Each user/browser has separate data store
- No data sharing between users
- Export/Import for data portability

---

## 7. Deployment Specification

### 7.1 Build Process
```bash
npm run build          # Standard production build
npm run build:gh-pages # GitHub Pages build (with base path)
```

### 7.2 Deployment Targets
- **GitHub Pages**: Automated via GitHub Actions
- **Static Hosting**: Any service that serves static files
- **PWA**: Service worker enables offline functionality

### 7.3 Environment Configuration
- Base path configurable for subdirectory deployment
- Environment variables: `GITHUB_PAGES`, `REPO_NAME`

---

## 8. Development Workflow

### 8.1 Local Development
```bash
npm install    # Install dependencies
npm run dev    # Start development server (localhost:5173)
npm run build  # Build for production
npm run preview # Preview production build
```

### 8.2 Code Quality
- TypeScript strict mode enabled
- ESLint configuration
- React hooks best practices

---

## 9. Future Enhancements (Not Currently Implemented)

- Multi-user collaboration
- Cloud sync
- Advanced reporting
- API integration
- Mobile app

---

## 10. Version History

See [CHANGELOG.md](./CHANGELOG.md) for detailed version history.

**Current Version**: 1.0.0

---

## License

Private project - All rights reserved

