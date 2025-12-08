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
      try {
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
      } catch (error) {
        console.error('Error seeding lenses in migration:', error)
        // Continue even if seeding fails - seedIfEmpty will handle it
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
    // Version 14: Add unique constraint on lenses.key and clean up duplicates
    this.version(14).stores({
      items: '++id, &[lens+name], lens, name, updatedAt',
      relationships: '++id, fromLens, fromItemId, toLens, toItemId',
      teamMembers: '++id, name, manager, team, updatedAt',
      meetingNotes: '++id, dateTime, createdAt, updatedAt',
      tasks: '++id, meetingNoteId, assignedTo, completedAt, createdAt, updatedAt',
      lenses: '++id, &key, order, updatedAt',
    }).upgrade(async (tx) => {
      try {
        // Clean up duplicate lenses (keep the first one for each key, ordered by id)
        const allLenses = await tx.table('lenses').orderBy('id').toArray()
        const seen = new Map<string, number>()
        const duplicates: number[] = []
        
        for (const lens of allLenses) {
          if (lens.id === undefined) continue
          if (seen.has(lens.key)) {
            // This is a duplicate, mark for deletion
            duplicates.push(lens.id)
          } else {
            seen.set(lens.key, lens.id)
          }
        }
        
        // Delete duplicates (only if we have lenses to keep)
        if (duplicates.length > 0 && seen.size > 0) {
          await tx.table('lenses').bulkDelete(duplicates)
        }
        
        // If no lenses exist after cleanup, seed them
        const remainingLenses = await tx.table('lenses').toArray()
        if (remainingLenses.length === 0) {
          const now = Date.now()
          const defaultLenses = DEFAULT_LENSES.map((lens, idx) => ({
            ...lens,
            order: idx,
            createdAt: now,
            updatedAt: now,
          }))
          await tx.table('lenses').bulkAdd(defaultLenses)
        }
      } catch (error) {
        console.error('Error in version 14 migration:', error)
        // If migration fails, seedIfEmpty will handle seeding
      }
    })
  }
}

export const db = new ArchLensesDB()

// Helper function to ensure database is ready
export async function ensureDbReady(): Promise<void> {
  try {
    if (!db.isOpen()) {
      console.log('Database not open, opening...')
      await db.open()
      console.log('Database opened successfully')
    }
    // Test database access by trying to read from a table
    const lensCount = await db.lenses.count()
    console.log(`Database ready, lens count: ${lensCount}`)
  } catch (error) {
    console.error('Database not ready:', error)
    // Try to reopen
    try {
      console.log('Attempting to close and reopen database...')
      await db.close()
      await db.open()
      console.log('Database reopened successfully')
      // Test again
      await db.lenses.count()
    } catch (reopenError) {
      console.error('Failed to reopen database:', reopenError)
      throw new Error(`Database is not accessible: ${reopenError instanceof Error ? reopenError.message : String(reopenError)}. Please refresh the page or clear your browser's IndexedDB storage.`)
    }
  }
}

export async function seedIfEmpty(): Promise<void> {
  try {
    // Ensure database is open
    if (!db.isOpen()) {
      await db.open()
    }
    
    // Seed lenses if empty (check by key to avoid duplicates)
    const existingLenses = await db.lenses.toArray()
    const existingKeys = new Set(existingLenses.map(l => l.key))
    
    if (existingKeys.size === 0) {
      // No lenses exist, seed all defaults
      const now = Date.now()
      const defaultLenses = DEFAULT_LENSES.map((lens, idx) => ({
        ...lens,
        order: idx,
        createdAt: now,
        updatedAt: now,
      }))
      try {
        await db.lenses.bulkAdd(defaultLenses)
      } catch (error) {
        // If bulkAdd fails (e.g., due to unique constraint), try adding one by one
        console.warn('Bulk add failed, trying individual adds:', error)
        for (const lens of defaultLenses) {
          try {
            await db.lenses.add(lens)
          } catch (err) {
            // Ignore duplicate key errors
            if (!(err instanceof Error && err.name === 'ConstraintError')) {
              console.error('Error adding lens:', lens.key, err)
            }
          }
        }
      }
    } else {
      // Some lenses exist, only add missing ones
      const now = Date.now()
      const missingLenses = DEFAULT_LENSES
        .filter(lens => !existingKeys.has(lens.key))
        .map((lens, idx) => ({
          ...lens,
          order: existingLenses.length + idx,
          createdAt: now,
          updatedAt: now,
        }))
      if (missingLenses.length > 0) {
        try {
          await db.lenses.bulkAdd(missingLenses)
        } catch (error) {
          // If bulkAdd fails, try adding one by one
          console.warn('Bulk add failed, trying individual adds:', error)
          for (const lens of missingLenses) {
            try {
              await db.lenses.add(lens)
            } catch (err) {
              // Ignore duplicate key errors
              if (!(err instanceof Error && err.name === 'ConstraintError')) {
                console.error('Error adding lens:', lens.key, err)
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error in seedIfEmpty:', error)
  }
  
  const count = await db.items.count()
  if (count > 0) return
  await db.transaction('rw', db.items, async () => {
    // no-op seeding items
  })
}

// Helper function to get all lenses
export async function getAllLenses(): Promise<LensDefinition[]> {
  try {
    // Ensure database is open
    if (!db.isOpen()) {
      await db.open()
    }
    
    let allLenses: LensDefinition[] = []
    try {
      allLenses = await db.lenses.orderBy('order').toArray()
    } catch (error) {
      // If orderBy fails (e.g., index not ready), try without ordering
      console.warn('orderBy failed, trying without order:', error)
      allLenses = await db.lenses.toArray()
    }
    
    // If no lenses found, try seeding
    if (allLenses.length === 0) {
      console.warn('No lenses found in database, attempting to seed...')
      await seedIfEmpty()
      // Try again after seeding
      try {
        allLenses = await db.lenses.orderBy('order').toArray()
      } catch (error) {
        allLenses = await db.lenses.toArray()
      }
    }
    
    // Deduplicate by key (keep the first occurrence of each key)
    const seen = new Map<string, LensDefinition>()
    for (const lens of allLenses) {
      if (!seen.has(lens.key)) {
        seen.set(lens.key, lens)
      }
    }
    const result = Array.from(seen.values())
    // Sort by order if available, otherwise by key
    result.sort((a, b) => {
      if (a.order !== undefined && b.order !== undefined) {
        return a.order - b.order
      }
      return a.key.localeCompare(b.key)
    })
    return result
  } catch (error) {
    console.error('Error in getAllLenses:', error)
    return []
  }
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
