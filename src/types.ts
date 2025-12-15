export type LensKey = string; // Now dynamic, can be any string

export interface LensDefinition {
  id?: number;
  key: LensKey;
  label: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}

// Default lenses for initial setup
export const DEFAULT_LENSES: Omit<LensDefinition, 'id' | 'createdAt' | 'updatedAt' | 'order'>[] = [
  { key: 'businessUnits', label: 'Business Units' },
  { key: 'domains', label: 'Domains' },
  { key: 'channels', label: 'Channels' },
  { key: 'applications', label: 'Applications' },
  { key: 'productFamilies', label: 'Product Families' },
  { key: 'platforms', label: 'Platforms' },
  { key: 'processes', label: 'Processes' },
  { key: 'capabilities', label: 'Capabilities' },
  { key: 'enablers', label: 'Enablers' },
];

// Legacy LENSES constant for backward compatibility (will be replaced by database)
export const LENSES: LensDefinition[] = DEFAULT_LENSES.map((l, idx) => ({
  ...l,
  id: idx,
  order: idx,
  createdAt: 0,
  updatedAt: 0,
}));

export type LifecycleStatus = 'Plan' | 'Emerging' | 'Invest' | 'Divest' | 'Stable'
export type RelationshipLifecycleStatus = 'Planned to add' | 'Planned to remove' | 'Existing'

export interface Hyperlink {
  label: string;
  url: string;
}

export interface ItemRecord {
  id?: number;
  lens: LensKey;
  name: string; // unique within lens
  description?: string;
  lifecycleStatus?: LifecycleStatus;
  businessContact?: string;
  techContact?: string;
  primaryArchitect?: string;
  secondaryArchitects: string[];
  tags: string[];
  skillsGaps?: string;
  parent?: string; // Used to group lens items together for display
  hyperlinks?: Hyperlink[]; // List of hyperlinks to related webpages
  architectureManager?: string; // Manager who owns this architecture lens item
  createdAt: number;
  updatedAt: number;
}

export type RelationshipType =
  | 'Parent-Child'
  | 'Replaces-Replaced By'
  | 'Enables-Depends On'
  | 'Default'

export type RelationshipSideLabel =
  | 'Parent'
  | 'Child'
  | 'Replaces'
  | 'Replaced By'
  | 'Enables'
  | 'Depends On'
  | 'Default'

const RELATIONSHIP_SIDE_MAP: Record<RelationshipType, { from: RelationshipSideLabel; to: RelationshipSideLabel }> = {
  'Parent-Child': { from: 'Parent', to: 'Child' },
  'Replaces-Replaced By': { from: 'Replaces', to: 'Replaced By' },
  'Enables-Depends On': { from: 'Enables', to: 'Depends On' },
  Default: { from: 'Default', to: 'Default' },
}

export function getRelationshipSides(type: RelationshipType | undefined): { from: RelationshipSideLabel; to: RelationshipSideLabel } {
  if (!type) return { from: 'Default', to: 'Default' }
  return RELATIONSHIP_SIDE_MAP[type] ?? { from: 'Default', to: 'Default' }
}

export function getOppositeSideLabel(type: RelationshipType, side: RelationshipSideLabel): RelationshipSideLabel {
  const sides = getRelationshipSides(type)
  if (side === sides.from) return sides.to
  if (side === sides.to) return sides.from
  return sides.to
}

export function inferRelationshipTypeFromSide(side: RelationshipSideLabel | undefined): RelationshipType | undefined {
  if (!side) return undefined
  const map: Record<RelationshipSideLabel, RelationshipType> = {
    Parent: 'Parent-Child',
    Child: 'Parent-Child',
    Replaces: 'Replaces-Replaced By',
    'Replaced By': 'Replaces-Replaced By',
    Enables: 'Enables-Depends On',
    'Depends On': 'Enables-Depends On',
    Default: 'Default',
  }
  return map[side]
}

export function getRelationshipTypeOptions(): Array<{ value: RelationshipType; label: RelationshipSideLabel }> {
  return [
    { value: 'Parent-Child', label: 'Parent' },
    { value: 'Parent-Child', label: 'Child' },
    { value: 'Replaces-Replaced By', label: 'Replaces' },
    { value: 'Replaces-Replaced By', label: 'Replaced By' },
    { value: 'Enables-Depends On', label: 'Enables' },
    { value: 'Enables-Depends On', label: 'Depends On' },
    { value: 'Default', label: 'Default' },
  ]
}

export interface RelationshipRecord {
  id?: number;
  fromLens: LensKey;
  fromItemId: number;
  toLens: LensKey;
  toItemId: number;
  lifecycleStatus?: RelationshipLifecycleStatus;
  relationshipType?: RelationshipType;
  fromItemIdRelationshipType?: RelationshipSideLabel;
  toItemIdRelationshipType?: RelationshipSideLabel;
  note?: string;
  createdAt: number;
}

export type TeamType = 'Architecture' | 'Business Stakeholder' | 'Tech Stakeholder'

export interface TeamMember {
  id?: number;
  name: string;
  manager?: string;
  team?: TeamType; // Defaults to 'Architecture' if not set
  createdAt: number;
  updatedAt: number;
}

export interface MeetingNote {
  id?: number;
  title: string;
  participants: string; // comma-separated list
  dateTime: number; // UTC timestamp
  content: string; // plain text notes
  relatedItems?: number[]; // array of item ids that are related to this note
  createdAt: number;
  updatedAt: number;
}

export interface Task {
  id?: number;
  meetingNoteId?: number; // Optional - tasks can exist without a meeting note
  description: string;
  assignedTo?: string; // person name
  itemReferences: number[]; // array of item ids
  completedAt?: number; // UTC timestamp when marked complete
  createdAt: number;
  updatedAt: number;
}

export type ExportBundle = {
  version: 1;
  exportedAt: string;
  items: ItemRecord[];
  relationships: RelationshipRecord[];
  teamMembers?: TeamMember[];
  meetingNotes?: MeetingNote[];
  tasks?: Task[];
  lenses?: LensDefinition[];
  theme?: any; // Theme from utils/theme.ts - using any to avoid circular dependency
};

export function hasGap(item: ItemRecord): boolean {
  if (!item.name?.trim()) return true;
  if (!item.businessContact?.trim()) return true;
  if (!item.techContact?.trim()) return true;
  if (!item.primaryArchitect?.trim()) return true;
  // Allow empty secondaryArchitects
  return false;
}
