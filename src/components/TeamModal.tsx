import { useEffect, useMemo, useState } from 'react'
import { db, getAllItemNames } from '../db'
import { type ItemRecord, type TeamMember, type MeetingNote, type Task, LENSES } from '../types'
type ViewType = 'main' | 'diagram' | 'architects' | 'stakeholders' | 'manage-team' | 'meeting-notes'

interface TeamModalProps {
  view: 'architects' | 'stakeholders'
  onEditPerson?: (personName: string) => void
  refreshKey?: number
  onOpenMeetingNote?: (noteId: number) => void
  onNavigate: (view: ViewType) => void
}

interface PersonCoverage {
  name: string
  manager?: string
  primaryCount: number
  secondaryCount: number
  primaryItems: Array<{ item: ItemRecord; lens: string }>
  secondaryItems: Array<{ item: ItemRecord; lens: string }>
  businessContactCount: number
  techContactCount: number
  businessContactItems: Array<{ item: ItemRecord; lens: string }>
  techContactItems: Array<{ item: ItemRecord; lens: string }>
  totalCoverage: number
  hasPrimary: boolean
  teamItems: Array<{ item: ItemRecord; lens: string }>
  hasDirectReports: boolean
}

type CoverageGroup = 'high' | 'medium' | 'low' | 'none' | 'all'


export function TeamModal({ view, onEditPerson, refreshKey, onOpenMeetingNote, onNavigate: _onNavigate }: TeamModalProps) {
  const [items, setItems] = useState<ItemRecord[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [meetingNotes, setMeetingNotes] = useState<MeetingNote[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [itemMap, setItemMap] = useState<Map<number, { name: string; lens: string }>>(new Map())

  const loadData = async () => {
    const [allItems, allMembers, allNotes, allTasks, itemNames] = await Promise.all([
      db.items.toArray(),
      db.teamMembers.toArray(),
      db.meetingNotes.toArray(),
      db.tasks.toArray(),
      getAllItemNames(),
    ])
    setItems(allItems)
    setTeamMembers(allMembers)
    setMeetingNotes(allNotes)
    setTasks(allTasks)
    
    // Build item map
    const map = new Map<number, { name: string; lens: string }>()
    itemNames.forEach(item => {
      map.set(item.id, { name: item.name, lens: item.lens })
    })
    setItemMap(map)
  }

  useEffect(() => {
    loadData()
  }, [refreshKey])

  // Calculate coverage for each person
  const personCoverage = useMemo(() => {
    const coverage = new Map<string, PersonCoverage>()

    // Initialize with team members (for architects view)
    if (view === 'architects') {
      teamMembers.forEach(member => {
        coverage.set(member.name, {
          name: member.name,
          manager: member.manager,
          primaryCount: 0,
          secondaryCount: 0,
          primaryItems: [],
          secondaryItems: [],
          businessContactCount: 0,
          techContactCount: 0,
          businessContactItems: [],
          techContactItems: [],
          totalCoverage: 0,
          hasPrimary: false,
          teamItems: [],
          hasDirectReports: false,
        })
      })
    }

    // Process items to calculate coverage
    items.forEach(item => {
      const lensLabel = LENSES.find(l => l.key === item.lens)?.label || item.lens

      // Primary architect
      if (item.primaryArchitect) {
        const name = item.primaryArchitect.trim()
        if (!coverage.has(name)) {
          coverage.set(name, {
            name,
            manager: teamMembers.find(m => m.name === name)?.manager,
            primaryCount: 0,
            secondaryCount: 0,
            primaryItems: [],
            secondaryItems: [],
            businessContactCount: 0,
            techContactCount: 0,
            businessContactItems: [],
            techContactItems: [],
            totalCoverage: 0,
            hasPrimary: false,
            teamItems: [],
            hasDirectReports: false,
          })
        }
        const person = coverage.get(name)!
        person.primaryCount++
        person.primaryItems.push({ item, lens: lensLabel })
        person.hasPrimary = true
      }

      // Secondary architects
      item.secondaryArchitects.forEach(arch => {
        const name = arch.trim()
        if (!name) return
        if (!coverage.has(name)) {
          coverage.set(name, {
            name,
            manager: teamMembers.find(m => m.name === name)?.manager,
            primaryCount: 0,
            secondaryCount: 0,
            primaryItems: [],
            secondaryItems: [],
            businessContactCount: 0,
            techContactCount: 0,
            businessContactItems: [],
            techContactItems: [],
            totalCoverage: 0,
            hasPrimary: false,
            teamItems: [],
            hasDirectReports: false,
          })
        }
        const person = coverage.get(name)!
        person.secondaryCount++
        person.secondaryItems.push({ item, lens: lensLabel })
      })

      // Business contacts
      if (item.businessContact) {
        const name = item.businessContact.trim()
        if (!coverage.has(name)) {
          coverage.set(name, {
            name,
            manager: undefined,
            primaryCount: 0,
            secondaryCount: 0,
            primaryItems: [],
            secondaryItems: [],
            businessContactCount: 0,
            techContactCount: 0,
            businessContactItems: [],
            techContactItems: [],
            totalCoverage: 0,
            hasPrimary: false,
            teamItems: [],
            hasDirectReports: false,
          })
        }
        const person = coverage.get(name)!
        person.businessContactCount++
        person.businessContactItems.push({ item, lens: lensLabel })
      }

      // Tech contacts
      if (item.techContact) {
        const name = item.techContact.trim()
        if (!coverage.has(name)) {
          coverage.set(name, {
            name,
            manager: undefined,
            primaryCount: 0,
            secondaryCount: 0,
            primaryItems: [],
            secondaryItems: [],
            businessContactCount: 0,
            techContactCount: 0,
            businessContactItems: [],
            techContactItems: [],
            totalCoverage: 0,
            hasPrimary: false,
            teamItems: [],
            hasDirectReports: false,
          })
        }
        const person = coverage.get(name)!
        person.techContactCount++
        person.techContactItems.push({ item, lens: lensLabel })
      }
    })

    // Calculate total coverage and team items (for architects view)
    coverage.forEach(person => {
      if (view === 'architects') {
        person.totalCoverage = person.primaryCount + person.secondaryCount
        
        // Check if person has direct reports
        const directReports = teamMembers.filter(m => m.manager === person.name)
        person.hasDirectReports = directReports.length > 0
        
        // Collect team items (items where direct reports are primary or secondary)
        if (person.hasDirectReports) {
          const directReportNames = new Set(directReports.map(m => m.name))
          const teamItemSet = new Set<number>() // Use Set to avoid duplicates
          
          items.forEach(item => {
            const lensLabel = LENSES.find(l => l.key === item.lens)?.label || item.lens
            // Check if any direct report is primary or secondary architect
            const isTeamItem = 
              (item.primaryArchitect && directReportNames.has(item.primaryArchitect.trim())) ||
              item.secondaryArchitects.some(arch => directReportNames.has(arch.trim()))
            
            if (isTeamItem && item.id && !teamItemSet.has(item.id)) {
              teamItemSet.add(item.id)
              person.teamItems.push({ item, lens: lensLabel })
            }
          })
        }
      } else {
        person.totalCoverage = person.businessContactCount + person.techContactCount
      }
    })

    // Filter based on view
    const filtered = Array.from(coverage.values()).filter(person => {
      if (view === 'architects') {
        // Only show people who are architects (have primary or secondary architect roles)
        // Exclude people who are only business/tech contacts
        return person.primaryCount > 0 || person.secondaryCount > 0 || teamMembers.some(m => m.name === person.name)
      } else {
        // Only show stakeholders (business/tech contacts)
        // Exclude people who are architects
        const isArchitect = person.primaryCount > 0 || person.secondaryCount > 0
        const isStakeholder = person.businessContactCount > 0 || person.techContactCount > 0
        return isStakeholder && !isArchitect
      }
    })

    return filtered
  }, [items, teamMembers, view])

  // Group by manager, then by coverage
  const groupedPeople = useMemo(() => {
    const groups = new Map<string | undefined, Map<CoverageGroup, PersonCoverage[]>>()

    personCoverage.forEach(person => {
      // For stakeholders, group by type (business vs tech) if they have both, otherwise by "No Category"
      let manager: string | undefined
      if (view === 'architects') {
        manager = person.manager || undefined
      } else {
        // Stakeholders: group by whether they're business, tech, or both
        const hasBusiness = person.businessContactCount > 0
        const hasTech = person.techContactCount > 0
        if (hasBusiness && hasTech) {
          manager = 'Business & Tech'
        } else if (hasBusiness) {
          manager = 'Business Stakeholders'
        } else if (hasTech) {
          manager = 'Tech Stakeholders'
        } else {
          manager = 'No Category'
        }
      }

      if (!groups.has(manager)) {
        if (view === 'architects') {
          groups.set(manager, new Map([
            ['high', []],
            ['medium', []],
            ['low', []],
            ['none', []],
          ]))
        } else {
          // For stakeholders, just use a single group (no coverage classification)
          groups.set(manager, new Map([
            ['all', []],
          ]))
        }
      }

      const managerGroup = groups.get(manager)!
      let coverageGroup: CoverageGroup = 'none'

      if (view === 'architects') {
        if (person.hasPrimary) {
          if (person.totalCoverage >= 5) coverageGroup = 'high'
          else if (person.totalCoverage >= 2) coverageGroup = 'medium'
          else coverageGroup = 'low'
        } else {
          // Secondary only
          if (person.secondaryCount >= 3) coverageGroup = 'medium'
          else if (person.secondaryCount >= 1) coverageGroup = 'low'
          else coverageGroup = 'none'
        }
        managerGroup.get(coverageGroup)!.push(person)
      } else {
        // Stakeholders - no coverage classification, just add to 'all' group
        managerGroup.get('all')!.push(person)
      }
    })

    // Sort within each group
    groups.forEach(managerGroup => {
      managerGroup.forEach((people) => {
        people.sort((a, b) => {
          // Primary roles first, then by total coverage
          if (view === 'architects') {
            if (a.hasPrimary !== b.hasPrimary) return a.hasPrimary ? -1 : 1
            return b.totalCoverage - a.totalCoverage
          } else {
            // For stakeholders, sort by name alphabetically
            return a.name.localeCompare(b.name)
          }
        })
      })
    })

    return groups
  }, [personCoverage, view])

  // Get items with skills gaps for the "New" box
  const itemsWithSkillsGaps = useMemo(() => {
    return items.filter(item => item.skillsGaps && item.skillsGaps.trim().length > 0)
  }, [items])

  function getCoverageColor(): string {
    // All boxes use white background with standard border
    return 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700'
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-900">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-xl font-semibold">{view === 'architects' ? 'Architecture Team Structure' : 'Stakeholder Structure'}</h1>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2">
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 relative">
          <div>
          {Array.from(groupedPeople.entries())
            .sort(([a], [b]) => {
              // Sort managers: undefined/null last, then alphabetically
              if (!a && !b) return 0
              if (!a) return 1
              if (!b) return -1
              return a.localeCompare(b)
            })
            .map(([manager, managerGroup]) => (
            <div key={manager || 'no-manager'} className="mb-4">
              <h3 className="text-base font-semibold mb-2 text-slate-700 dark:text-slate-300">
                {manager || 'No Manager Assigned'}
              </h3>
              {(view === 'architects' 
                ? (['high', 'medium', 'low', 'none'] as CoverageGroup[])
                : (['all'] as CoverageGroup[])
              ).map(coverageGroup => {
                const people = managerGroup.get(coverageGroup) || []
                // Don't show empty groups
                if (people.length === 0) return null

                return (
                  <div key={coverageGroup} className="mb-3">
                    {view === 'architects' && coverageGroup === 'none' && (
                      <h4 className="text-xs font-medium mb-1.5 text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                        No Coverage
                      </h4>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2">
                      {people.map(person => (
                        <div
                          key={person.name}
                          className={`p-2 rounded border-2 ${getCoverageColor()} ${
                            view === 'architects' && !person.hasPrimary && person.secondaryCount > 0 ? 'border-dashed' : ''
                          } bg-white dark:bg-slate-900`}
                        >
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <div 
                              className="font-semibold text-sm text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
                              onClick={() => onEditPerson?.(person.name)}
                              title="Click to edit person"
                            >
                              {person.name}
                            </div>
                            {view === 'architects' && person.hasPrimary && (
                              <span className="text-[10px] px-1 py-0.5 bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded">
                                Key
                              </span>
                            )}
                            {view === 'architects' && !person.hasPrimary && person.secondaryCount > 0 && (
                              <span className="text-[10px] px-1 py-0.5 bg-purple-200 dark:bg-purple-800 text-purple-800 dark:text-purple-200 rounded">
                                Sec
                              </span>
                            )}
                          </div>

                          {view === 'architects' ? (
                            <div className="mt-1.5 pt-1.5 border-t border-slate-300 dark:border-slate-700">
                              {person.primaryItems.length > 0 && (
                                <div className="mb-1">
                                  <div className="text-[10px] font-medium mb-0.5">Primary:</div>
                                  {person.primaryItems.map(({ item, lens }, idx) => (
                                    <div key={idx} className="text-[10px] text-slate-600 dark:text-slate-400 leading-tight">
                                      • {item.name} ({lens})
                                    </div>
                                  ))}
                                </div>
                              )}
                              {person.secondaryItems.length > 0 && (
                                <div>
                                  <div className="text-[10px] font-medium mb-0.5">Secondary:</div>
                                  {person.secondaryItems.map(({ item, lens }, idx) => (
                                    <div key={idx} className="text-[10px] text-slate-600 dark:text-slate-400 leading-tight">
                                      • {item.name} ({lens})
                                    </div>
                                  ))}
                                </div>
                              )}
                              {person.primaryItems.length === 0 && person.secondaryItems.length === 0 && (
                                <div className="text-[10px] text-slate-500 dark:text-slate-400 italic">
                                  No items assigned
                                </div>
                              )}
                              {person.hasDirectReports && person.teamItems.length > 0 && (
                                <div className="mt-1.5 pt-1.5 border-t border-slate-300 dark:border-slate-700">
                                  <div className="text-[10px] font-medium mb-0.5">Team:</div>
                                  {person.teamItems.map(({ item, lens }, idx) => (
                                    <div key={idx} className="text-[10px] text-slate-600 dark:text-slate-400 leading-tight">
                                      • {item.name} ({lens})
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="mt-1.5 pt-1.5 border-t border-slate-300 dark:border-slate-700">
                              {person.businessContactItems.length > 0 && (
                                <div className="mb-1">
                                  <div className="text-[10px] font-medium mb-0.5">Business:</div>
                                  {person.businessContactItems.map(({ item, lens }, idx) => (
                                    <div key={idx} className="text-[10px] text-slate-600 dark:text-slate-400 leading-tight">
                                      • {item.name} ({lens})
                                      {item.primaryArchitect && (
                                        <span className="text-slate-500 dark:text-slate-500 ml-1">
                                          - {item.primaryArchitect}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {person.techContactItems.length > 0 && (
                                <div className={person.businessContactItems.length > 0 ? "mb-1" : ""}>
                                  <div className="text-[10px] font-medium mb-0.5">Tech:</div>
                                  {person.techContactItems.map(({ item, lens }, idx) => (
                                    <div key={idx} className="text-[10px] text-slate-600 dark:text-slate-400 leading-tight">
                                      • {item.name} ({lens})
                                      {item.primaryArchitect && (
                                        <span className="text-slate-500 dark:text-slate-500 ml-1">
                                          - {item.primaryArchitect}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                              
                              {/* Outstanding Tasks */}
                              {(() => {
                                // Find all outstanding tasks from meetings where this stakeholder was a participant
                                const stakeholderTasks = tasks.filter(task => {
                                  if (task.completedAt) return false // Only outstanding tasks
                                  
                                  const note = meetingNotes.find(n => n.id === task.meetingNoteId)
                                  if (!note) return false
                                  
                                  // Check if stakeholder name appears in participants (comma-separated list)
                                  const participants = note.participants.split(',').map(p => p.trim().toLowerCase())
                                  return participants.includes(person.name.toLowerCase())
                                })
                                
                                if (stakeholderTasks.length === 0) return null
                                
                                return (
                                  <div className="mt-1.5 pt-1.5 border-t border-slate-300 dark:border-slate-700">
                                    <div className="text-[10px] font-medium mb-0.5">Outstanding Tasks:</div>
                                    {stakeholderTasks.map(task => {
                                      const note = meetingNotes.find(n => n.id === task.meetingNoteId)
                                      return (
                                        <div key={task.id} className="text-[10px] text-slate-600 dark:text-slate-400 leading-tight mb-1">
                                          <div className="flex items-start gap-1">
                                            <button
                                              onClick={async (e) => {
                                                e.stopPropagation()
                                                const now = Date.now()
                                                await db.tasks.update(task.id!, {
                                                  completedAt: now,
                                                  updatedAt: now,
                                                })
                                                loadData() // Reload to refresh display
                                              }}
                                              className="text-slate-500 hover:text-green-600 flex-shrink-0 mt-0.5"
                                              title="Mark as complete"
                                            >
                                              ○
                                            </button>
                                            <div className="flex-1 min-w-0">
                                              <div className="font-medium">{task.description}</div>
                                              {task.assignedTo && (
                                                <div className="text-slate-500">Assigned: {task.assignedTo}</div>
                                              )}
                                              {task.itemReferences && task.itemReferences.length > 0 && (
                                                <div className="text-slate-500">
                                                  Items: {task.itemReferences.map((itemId, idx) => {
                                                    const item = itemMap.get(itemId)
                                                    return item ? (
                                                      <span key={itemId}>
                                                        {idx > 0 && ', '}
                                                        {LENSES.find(l => l.key === item.lens)?.label || item.lens}: {item.name}
                                                      </span>
                                                    ) : null
                                                  })}
                                                </div>
                                              )}
                                              {note && (
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation()
                                                    onOpenMeetingNote?.(note.id!)
                                                  }}
                                                  className="text-blue-600 dark:text-blue-400 hover:underline text-[9px] mt-0.5"
                                                >
                                                  {note.title || '(Untitled)'}
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )
                              })()}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
          {/* "Skills Needed" box for items with skills gaps - only show in architects view, at the bottom */}
          {view === 'architects' && itemsWithSkillsGaps.length > 0 && (
            <div className="mb-4">
              <h3 className="text-base font-semibold mb-2 text-slate-700 dark:text-slate-300">
                Skills Needed
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2">
                {itemsWithSkillsGaps.map(item => {
                  const lensLabel = LENSES.find(l => l.key === item.lens)?.label || item.lens
                  return (
                    <div
                      key={item.id}
                      className="p-2 rounded border-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                    >
                      <div className="font-semibold text-sm text-slate-800 dark:text-slate-200 mb-1.5">
                        {item.name}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-1">
                        {lensLabel}
                      </div>
                      <div className="mt-1.5 pt-1.5 border-t border-slate-300 dark:border-slate-700">
                        <div className="text-[10px] text-slate-600 dark:text-slate-400 leading-tight whitespace-pre-wrap">
                          {item.skillsGaps}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  )
}

