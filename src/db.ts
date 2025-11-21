import Dexie, { type Table } from 'dexie'
import type { ItemRecord, RelationshipRecord, TeamMember } from './types'

class ArchLensesDB extends Dexie {
  items!: Table<ItemRecord, number>
  relationships!: Table<RelationshipRecord, number>
  teamMembers!: Table<TeamMember, number>

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
  }
}

export const db = new ArchLensesDB()

export async function seedIfEmpty(): Promise<void> {
  const count = await db.items.count()
  if (count > 0) return
  await db.transaction('rw', db.items, async () => {
    // no-op seeding items
  })
}
