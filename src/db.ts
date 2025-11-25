import Dexie, { type Table } from 'dexie'
import type { ItemRecord, RelationshipRecord, TeamMember, MeetingNote, Task } from './types'

class ArchLensesDB extends Dexie {
  items!: Table<ItemRecord, number>
  relationships!: Table<RelationshipRecord, number>
  teamMembers!: Table<TeamMember, number>
  meetingNotes!: Table<MeetingNote, number>
  tasks!: Table<Task, number>

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
