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

export interface ItemRecord {
  id?: number;
  lens: LensKey;
  name: string; // unique within lens
  businessContact?: string;
  techContact?: string;
  primaryArchitect?: string;
  secondaryArchitects: string[];
  tags: string[];
  skillsGaps?: string;
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

export type ExportBundle = {
  version: 1;
  exportedAt: string;
  items: ItemRecord[];
  relationships: RelationshipRecord[];
};

export function hasGap(item: ItemRecord): boolean {
  if (!item.name?.trim()) return true;
  if (!item.businessContact?.trim()) return true;
  if (!item.techContact?.trim()) return true;
  if (!item.primaryArchitect?.trim()) return true;
  // Allow empty secondaryArchitects
  return false;
}
