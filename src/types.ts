export type LensKey =
  | 'businessUnits'
  | 'domains'
  | 'channels'
  | 'applications'
  | 'productFamilies'
  | 'platforms'
  | 'processes'
  | 'capabilities'
  | 'enablers';

export interface LensDefinition {
  key: LensKey;
  label: string;
}

export const LENSES: LensDefinition[] = [
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

export type LifecycleStatus = 'Plan' | 'Emerging' | 'Invest' | 'Divest' | 'Stable'

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
  createdAt: number;
  updatedAt: number;
}

export interface RelationshipRecord {
  id?: number;
  fromLens: LensKey;
  fromItemId: number;
  toLens: LensKey;
  toItemId: number;
  createdAt: number;
}

export interface TeamMember {
  id?: number;
  name: string;
  manager?: string;
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
  meetingNoteId: number;
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
};

export function hasGap(item: ItemRecord): boolean {
  if (!item.name?.trim()) return true;
  if (!item.businessContact?.trim()) return true;
  if (!item.techContact?.trim()) return true;
  if (!item.primaryArchitect?.trim()) return true;
  // Allow empty secondaryArchitects
  return false;
}
