import Dexie, { type Table } from 'dexie'
import type { ItemRecord, RelationshipRecord, TeamMember, MeetingNote, Task, LensDefinition, LensKey } from './types'
import { DEFAULT_LENSES } from './types'

class ArchLensesDB extends Dexie {
  items!: Table<ItemRecord, number>
  relationships!: Table<RelationshipRecord, number>
  teamMembers!: Table<TeamMember, number>
  meetingNotes!: Table<MeetingNote, number>
  tasks!: Table<Task, number>
  lenses!: Table<LensDefinition, number>

  constructor() {
    super('arch-lenses-db')
    this.version(1).stores({
      // lens+name unique compound index, and by lens for queries
      items: '++id, &[lens+name], lens, name, updatedAt',
      relationships: '++id, fromLens, fromItemId, toLens, toItemId',
    })
    // Version 2: Add skillsGaps field (no schema change needed, just version bump for migration)
    this.version(2).stores({
      items: '++id, &[lens+name], lens, name, updatedAt',
      relationships: '++id, fromLens, fromItemId, toLens, toItemId',
    })
    // Version 3: Add team members table
    this.version(3).stores({
      items: '++id, &[lens+name], lens, name, updatedAt',
      relationships: '++id, fromLens, fromItemId, toLens, toItemId',
      teamMembers: '++id, name, manager, updatedAt',
    })
    // Version 4: Add meeting notes and tasks
    this.version(4).stores({
      items: '++id, &[lens+name], lens, name, updatedAt',
      relationships: '++id, fromLens, fromItemId, toLens, toItemId',
      teamMembers: '++id, name, manager, updatedAt',
      meetingNotes: '++id, dateTime, createdAt, updatedAt',
      tasks: '++id, meetingNoteId, assignedTo, itemReference, completedAt, createdAt, updatedAt',
    })
    // Version 5: Update tasks to support multiple item references (itemReferences array)
    this.version(5).stores({
      items: '++id, &[lens+name], lens, name, updatedAt',
      relationships: '++id, fromLens, fromItemId, toLens, toItemId',
      teamMembers: '++id, name, manager, updatedAt',
      meetingNotes: '++id, dateTime, createdAt, updatedAt',
      tasks: '++id, meetingNoteId, assignedTo, completedAt, createdAt, updatedAt',
    })
    // Version 6: Add title to meeting notes
    this.version(6).stores({
      items: '++id, &[lens+name], lens, name, updatedAt',
      relationships: '++id, fromLens, fromItemId, toLens, toItemId',
      teamMembers: '++id, name, manager, updatedAt',
      meetingNotes: '++id, dateTime, createdAt, updatedAt',
      tasks: '++id, meetingNoteId, assignedTo, completedAt, createdAt, updatedAt',
    })
    // Version 7: Add relatedItems to meeting notes
    this.version(7).stores({
      items: '++id, &[lens+name], lens, name, updatedAt',
      relationships: '++id, fromLens, fromItemId, toLens, toItemId',
      teamMembers: '++id, name, manager, updatedAt',
      meetingNotes: '++id, dateTime, createdAt, updatedAt',
      tasks: '++id, meetingNoteId, assignedTo, completedAt, createdAt, updatedAt',
    })
    // Version 8: Add parent and hyperlinks to items
    this.version(8).stores({
      items: '++id, &[lens+name], lens, name, updatedAt',
      relationships: '++id, fromLens, fromItemId, toLens, toItemId',
      teamMembers: '++id, name, manager, updatedAt',
      meetingNotes: '++id, dateTime, createdAt, updatedAt',
      tasks: '++id, meetingNoteId, assignedTo, completedAt, createdAt, updatedAt',
    })
    // Version 9: Add lenses table
    this.version(9).stores({
      items: '++id, &[lens+name], lens, name, updatedAt',
      relationships: '++id, fromLens, fromItemId, toLens, toItemId',
      teamMembers: '++id, name, manager, updatedAt',
      meetingNotes: '++id, dateTime, createdAt, updatedAt',
      tasks: '++id, meetingNoteId, assignedTo, completedAt, createdAt, updatedAt',
      lenses: '++id, key, order, updatedAt',
    }).upgrade(async (tx) => {
      // Migrate default lenses to database
      const now = Date.now()
      const existingLenses = await tx.table('lenses').toArray()
      if (existingLenses.length === 0) {
        const defaultLenses = DEFAULT_LENSES.map((lens, idx) => ({
          ...lens,
          order: idx,
          createdAt: now,
          updatedAt: now,
        }))
        await tx.table('lenses').bulkAdd(defaultLenses)
      }
    })
    // Version 10: Make meetingNoteId optional in tasks (allow standalone tasks)
    this.version(10).stores({
      items: '++id, &[lens+name], lens, name, updatedAt',
      relationships: '++id, fromLens, fromItemId, toLens, toItemId',
      teamMembers: '++id, name, manager, updatedAt',
      meetingNotes: '++id, dateTime, createdAt, updatedAt',
      tasks: '++id, meetingNoteId, assignedTo, completedAt, createdAt, updatedAt',
      lenses: '++id, key, order, updatedAt',
    })
    // Version 11: Add team field to teamMembers
    this.version(11).stores({
      items: '++id, &[lens+name], lens, name, updatedAt',
      relationships: '++id, fromLens, fromItemId, toLens, toItemId',
      teamMembers: '++id, name, manager, team, updatedAt',
      meetingNotes: '++id, dateTime, createdAt, updatedAt',
      tasks: '++id, meetingNoteId, assignedTo, completedAt, createdAt, updatedAt',
      lenses: '++id, key, order, updatedAt',
    }).upgrade(async (tx) => {
      // Set default team to 'Architecture' for existing members
      const members = await tx.table('teamMembers').toArray()
      for (const member of members) {
        if (!member.team) {
          await tx.table('teamMembers').update(member.id!, { team: 'Architecture' })
        }
      }
    })
    // Version 12: Add architectureManager field to items (no schema change needed, just version bump)
    this.version(12).stores({
      items: '++id, &[lens+name], lens, name, updatedAt',
      relationships: '++id, fromLens, fromItemId, toLens, toItemId',
      teamMembers: '++id, name, manager, team, updatedAt',
      meetingNotes: '++id, dateTime, createdAt, updatedAt',
      tasks: '++id, meetingNoteId, assignedTo, completedAt, createdAt, updatedAt',
      lenses: '++id, key, order, updatedAt',
    })
    // Version 13: Add lifecycleStatus field to relationships (no schema change needed, just version bump)
    this.version(13).stores({
      items: '++id, &[lens+name], lens, name, updatedAt',
      relationships: '++id, fromLens, fromItemId, toLens, toItemId',
      teamMembers: '++id, name, manager, team, updatedAt',
      meetingNotes: '++id, dateTime, createdAt, updatedAt',
      tasks: '++id, meetingNoteId, assignedTo, completedAt, createdAt, updatedAt',
      lenses: '++id, key, order, updatedAt',
    })
    // Version 14: no-op placeholder for earlier unique lens work
    this.version(14).stores({
      items: '++id, &[lens+name], lens, name, updatedAt',
      relationships: '++id, fromLens, fromItemId, toLens, toItemId',
      teamMembers: '++id, name, manager, team, updatedAt',
      meetingNotes: '++id, dateTime, createdAt, updatedAt',
      tasks: '++id, meetingNoteId, assignedTo, completedAt, createdAt, updatedAt',
      lenses: '++id, key, order, updatedAt',
    })
    // Version 15: Add relationshipType and note (no index change)
    this.version(15).stores({
      items: '++id, &[lens+name], lens, name, updatedAt',
      relationships: '++id, fromLens, fromItemId, toLens, toItemId',
      teamMembers: '++id, name, manager, team, updatedAt',
      meetingNotes: '++id, dateTime, createdAt, updatedAt',
      tasks: '++id, meetingNoteId, assignedTo, completedAt, createdAt, updatedAt',
      lenses: '++id, key, order, updatedAt',
    })
    // Version 16: Add from/to relationship side fields (no index change)
    this.version(16).stores({
      items: '++id, &[lens+name], lens, name, updatedAt',
      relationships: '++id, fromLens, fromItemId, toLens, toItemId',
      teamMembers: '++id, name, manager, team, updatedAt',
      meetingNotes: '++id, dateTime, createdAt, updatedAt',
      tasks: '++id, meetingNoteId, assignedTo, completedAt, createdAt, updatedAt',
      lenses: '++id, key, order, updatedAt',
    }).upgrade(async tx => {
      const relationships = await tx.table('relationships').toArray()
      const map: Record<string, { from: string; to: string }> = {
        'Parent-Child': { from: 'Parent', to: 'Child' },
        'Replaces-Replaced By': { from: 'Replaces', to: 'Replaced By' },
        'Enables-Depends On': { from: 'Enables', to: 'Depends On' },
        Default: { from: 'Default', to: 'Default' },
      }
      for (const rel of relationships) {
        const sides = map[(rel as any).relationshipType as string] || map.Default
        await tx.table('relationships').update(rel.id!, {
          fromItemIdRelationshipType: sides.from,
          toItemIdRelationshipType: sides.to,
        })
      }
    })
    // Version 17: Relationship lifecycle fidelity
    this.version(17).stores({
      items: '++id, &[lens+name], lens, name, updatedAt',
      relationships: '++id, fromLens, fromItemId, toLens, toItemId',
      teamMembers: '++id, name, manager, team, updatedAt',
      meetingNotes: '++id, dateTime, createdAt, updatedAt',
      tasks: '++id, meetingNoteId, assignedTo, completedAt, createdAt, updatedAt',
      lenses: '++id, key, order, updatedAt',
    }).upgrade(async tx => {
      const relationships = await tx.table('relationships').toArray()
      for (const rel of relationships) {
        const current = (rel as any).lifecycleStatus
        let mapped: 'Planned to add' | 'Planned to remove' | 'Existing'
        if (!current) mapped = 'Existing'
        else if (current === 'Plan' || current === 'Planned to add') mapped = 'Planned to add'
        else mapped = 'Existing'
        await tx.table('relationships').update(rel.id!, { lifecycleStatus: mapped })
      }
    })
    // Version 18: Add compound index for relationship queries by fromItemId+toItemId
    this.version(18).stores({
      items: '++id, &[lens+name], lens, name, updatedAt',
      relationships: '++id,[fromItemId+toItemId],fromLens,fromItemId,toLens,toItemId',
      teamMembers: '++id, name, manager, team, updatedAt',
      meetingNotes: '++id, dateTime, createdAt, updatedAt',
      tasks: '++id, meetingNoteId, assignedTo, completedAt, createdAt, updatedAt',
      lenses: '++id, key, order, updatedAt',
    })
  }
}

export const db = new ArchLensesDB()

export async function seedIfEmpty(): Promise<void> {
  // Seed lenses if empty
  const lensCount = await db.lenses.count()
  if (lensCount === 0) {
    const now = Date.now()
    const defaultLenses = DEFAULT_LENSES.map((lens, idx) => ({
      ...lens,
      order: idx,
      createdAt: now,
      updatedAt: now,
    }))
    await db.lenses.bulkAdd(defaultLenses)
  }
  
  const count = await db.items.count()
  if (count > 0) return
  await db.transaction('rw', db.items, async () => {
    // no-op seeding items
  })
}

// Helper function to get all lenses
export async function getAllLenses(): Promise<LensDefinition[]> {
  return await db.lenses.orderBy('order').toArray()
}

// Helper function to get lens by key
export async function getLensByKey(key: LensKey): Promise<LensDefinition | undefined> {
  return await db.lenses.where('key').equals(key).first()
}

// Helper function to get all people names (team members + stakeholders from items)
export async function getAllPeopleNames(): Promise<string[]> {
  const teamMembers = await db.teamMembers.toArray()
  const items = await db.items.toArray()
  const people = new Set<string>()
  
  teamMembers.forEach(m => people.add(m.name))
  items.forEach(item => {
    if (item.businessContact) people.add(item.businessContact)
    if (item.techContact) people.add(item.techContact)
    if (item.primaryArchitect) people.add(item.primaryArchitect)
    item.secondaryArchitects.forEach(a => people.add(a))
  })
  
  return Array.from(people).sort()
}

// Helper function to get all item names across all lenses
export async function getAllItemNames(): Promise<Array<{ id: number; name: string; lens: string }>> {
  const items = await db.items.toArray()
  return items.map(item => ({
    id: item.id!,
    name: item.name,
    lens: item.lens
  })).sort((a, b) => a.name.localeCompare(b.name))
}


// Ensure database is open and ready
export async function ensureDbReady(): Promise<void> {
  if (!db.isOpen()) {
    await db.open()
  }
  // Touch a table to verify access
  await db.lenses.count()
}
