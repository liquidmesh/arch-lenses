import { useEffect, useMemo, useState } from 'react'
import { db, getAllItemNames } from '../db'
import { type ItemRecord, type TeamMember, type MeetingNote, type Task, LENSES } from '../types'
type ViewType = 'main' | 'diagram' | 'architects' | 'stakeholders' | 'manage-team' | 'meeting-notes'

interface TeamModalProps {
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

// Helper function to group and sort items by lens
function groupAndSortItems(items: Array<{ item: ItemRecord; lens: string }>): Array<{ lens: string; items: Array<{ item: ItemRecord; lens: string }> }> {
  // Group by lens
  const grouped = new Map<string, Array<{ item: ItemRecord; lens: string }>>()
  items.forEach(({ item, lens }) => {
    if (!grouped.has(lens)) {
      grouped.set(lens, [])
    }
    grouped.get(lens)!.push({ item, lens })
  })
  
  // Sort items within each group by item name
  grouped.forEach((items) => {
    items.sort((a, b) => a.item.name.localeCompare(b.item.name))
  })
  
  // Convert to array and sort by lens name
  return Array.from(grouped.entries())
    .map(([lens, items]) => ({ lens, items }))
    .sort((a, b) => a.lens.localeCompare(b.lens))
}

export function TeamModal({ onEditPerson, refreshKey, onOpenMeetingNote, onNavigate: _onNavigate }: TeamModalProps) {
  const [teamFilter, setTeamFilter] = useState<'Architecture' | 'Business Stakeholders' | 'Tech Stakeholders' | 'All Stakeholders'>('Architecture')
  const [managerFilter, setManagerFilter] = useState<string>('All')
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

    // Initialize with team members based on team filter
    const shouldIncludeArchitecture = teamFilter === 'Architecture'
    const shouldIncludeBusiness = teamFilter === 'Business Stakeholders' || teamFilter === 'All Stakeholders'
    const shouldIncludeTech = teamFilter === 'Tech Stakeholders' || teamFilter === 'All Stakeholders'
    
    teamMembers.forEach(member => {
      const memberTeam = member.team || 'Architecture'
      const shouldInclude = 
        (shouldIncludeArchitecture && memberTeam === 'Architecture') ||
        (shouldIncludeBusiness && memberTeam === 'Business Stakeholder') ||
        (shouldIncludeTech && memberTeam === 'Tech Stakeholder')
      
      if (shouldInclude) {
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
      }
    })

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

    // Calculate total coverage and team items
    const isArchitectureView = teamFilter === 'Architecture'
    
    coverage.forEach(person => {
      if (isArchitectureView) {
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

    // Filter based on team filter
    const shouldShowArchitecture = teamFilter === 'Architecture'
    const shouldShowBusiness = teamFilter === 'Business Stakeholders' || teamFilter === 'All Stakeholders'
    const shouldShowTech = teamFilter === 'Tech Stakeholders' || teamFilter === 'All Stakeholders'
    
    let filtered = Array.from(coverage.values()).filter(person => {
      const member = teamMembers.find(m => m.name === person.name)
      const memberTeam = member?.team || 'Architecture'
      
      if (shouldShowArchitecture) {
        // Show architecture team members
        return memberTeam === 'Architecture' && (person.primaryCount > 0 || person.secondaryCount > 0 || member)
      } else if (shouldShowBusiness && shouldShowTech) {
        // Show all stakeholders
        return (memberTeam === 'Business Stakeholder' || memberTeam === 'Tech Stakeholder') &&
               (person.businessContactCount > 0 || person.techContactCount > 0)
      } else if (shouldShowBusiness) {
        // Show only business stakeholders
        return memberTeam === 'Business Stakeholder' && person.businessContactCount > 0
      } else if (shouldShowTech) {
        // Show only tech stakeholders
        return memberTeam === 'Tech Stakeholder' && person.techContactCount > 0
      }
      return false
    })
    
    // Apply manager filter
    if (managerFilter !== 'All') {
      if (managerFilter === 'Unassigned') {
        filtered = filtered.filter(person => !person.manager)
      } else {
        filtered = filtered.filter(person => person.manager === managerFilter)
      }
    }

    return filtered
  }, [items, teamMembers, teamFilter, managerFilter])

  // Group by manager, then by coverage
  const groupedPeople = useMemo(() => {
    const groups = new Map<string | undefined, Map<CoverageGroup, PersonCoverage[]>>()
    const isArchitectureView = teamFilter === 'Architecture'

    personCoverage.forEach(person => {
      // For stakeholders, group by type (business vs tech) if they have both, otherwise by "No Category"
      let manager: string | undefined
      if (isArchitectureView) {
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
        if (isArchitectureView) {
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

      if (isArchitectureView) {
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

    // Sort within each group alphabetically by name
    groups.forEach(managerGroup => {
      managerGroup.forEach((people) => {
        people.sort((a, b) => a.name.localeCompare(b.name))
      })
    })

    return groups
  }, [personCoverage, teamFilter])
  
  // Get unique manager names for filter dropdown
  const managerNames = useMemo(() => {
    const managers = new Set<string>()
    teamMembers.forEach((m: TeamMember) => {
      if (m.manager) managers.add(m.manager)
    })
    return Array.from(managers).sort()
  }, [teamMembers])

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
      <div className="flex items-center gap-4 p-4 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-xl font-semibold">Team Structure</h1>
        <label className="flex items-center gap-2">
          <span className="text-sm font-medium">Team:</span>
          <select
            value={teamFilter}
            onChange={e => setTeamFilter(e.target.value as typeof teamFilter)}
            className="px-2 py-1 text-sm rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
          >
            <option value="Architecture">Architecture</option>
            <option value="Business Stakeholders">Business Stakeholders</option>
            <option value="Tech Stakeholders">Tech Stakeholders</option>
            <option value="All Stakeholders">All Stakeholders</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-sm font-medium">Manager:</span>
          <select
            value={managerFilter}
            onChange={e => setManagerFilter(e.target.value)}
            className="px-2 py-1 text-sm rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
          >
            <option value="All">All</option>
            <option value="Unassigned">Unassigned</option>
            {managerNames.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>
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
              {((teamFilter === 'Architecture')
                ? (['high', 'medium', 'low', 'none'] as CoverageGroup[])
                : (['all'] as CoverageGroup[])
              ).map(coverageGroup => {
                const people = managerGroup.get(coverageGroup) || []
                // Don't show empty groups
                if (people.length === 0) return null

                return (
                  <div key={coverageGroup} className="mb-3">
                    {teamFilter === 'Architecture' && coverageGroup === 'none' && (
                      <h4 className="text-xs font-medium mb-1.5 text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                        No Coverage
                      </h4>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2">
                      {people.map(person => (
                        <div
                          key={person.name}
                          className={`p-2 rounded border-2 ${getCoverageColor()} ${
                            teamFilter === 'Architecture' && !person.hasPrimary && person.secondaryCount > 0 ? 'border-dashed' : ''
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
                            {teamFilter === 'Architecture' && person.hasPrimary && (
                              <span className="text-[10px] px-1 py-0.5 bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded">
                                Key
                              </span>
                            )}
                            {teamFilter === 'Architecture' && !person.hasPrimary && person.secondaryCount > 0 && (
                              <span className="text-[10px] px-1 py-0.5 bg-purple-200 dark:bg-purple-800 text-purple-800 dark:text-blue-200 rounded">
                                Sec
                              </span>
                            )}
                          </div>

                          {teamFilter === 'Architecture' ? (
                            <div className="mt-1.5 pt-1.5 border-t border-slate-300 dark:border-slate-700">
                              {person.primaryItems.length > 0 && (
                                <div className="mb-1">
                                  <div className="text-[10px] font-medium mb-0.5">Primary:</div>
                                  {groupAndSortItems(person.primaryItems).map(({ lens, items }) => (
                                    <div key={lens} className="mb-0.5">
                                      <div className="text-[10px] font-semibold text-slate-700 dark:text-slate-300">{lens}:</div>
                                      {items.map(({ item }, idx) => (
                                        <div key={idx} className="text-[10px] text-slate-600 dark:text-slate-400 leading-tight ml-2">
                                          • {item.name}
                                        </div>
                                      ))}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {person.secondaryItems.length > 0 && (
                                <div>
                                  <div className="text-[10px] font-medium mb-0.5">Secondary:</div>
                                  {groupAndSortItems(person.secondaryItems).map(({ lens, items }) => (
                                    <div key={lens} className="mb-0.5">
                                      <div className="text-[10px] font-semibold text-slate-700 dark:text-slate-300">{lens}:</div>
                                      {items.map(({ item }, idx) => (
                                        <div key={idx} className="text-[10px] text-slate-600 dark:text-slate-400 leading-tight ml-2">
                                          • {item.name}
                                        </div>
                                      ))}
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
                                  {groupAndSortItems(person.teamItems).map(({ lens, items }) => (
                                    <div key={lens} className="mb-0.5">
                                      <div className="text-[10px] font-semibold text-slate-700 dark:text-slate-300">{lens}:</div>
                                      {items.map(({ item }, idx) => (
                                        <div key={idx} className="text-[10px] text-slate-600 dark:text-slate-400 leading-tight ml-2">
                                          • {item.name}
                                        </div>
                                      ))}
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
                                  {groupAndSortItems(person.businessContactItems).map(({ lens, items }) => (
                                    <div key={lens} className="mb-0.5">
                                      <div className="text-[10px] font-semibold text-slate-700 dark:text-slate-300">{lens}:</div>
                                      {items.map(({ item }, idx) => (
                                        <div key={idx} className="text-[10px] text-slate-600 dark:text-slate-400 leading-tight ml-2">
                                          • {item.name}
                                          {item.primaryArchitect && (
                                            <span className="text-slate-500 dark:text-slate-500 ml-1">
                                              - {item.primaryArchitect}
                                            </span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {person.techContactItems.length > 0 && (
                                <div className={person.businessContactItems.length > 0 ? "mb-1" : ""}>
                                  <div className="text-[10px] font-medium mb-0.5">Tech:</div>
                                  {groupAndSortItems(person.techContactItems).map(({ lens, items }) => (
                                    <div key={lens} className="mb-0.5">
                                      <div className="text-[10px] font-semibold text-slate-700 dark:text-slate-300">{lens}:</div>
                                      {items.map(({ item }, idx) => (
                                        <div key={idx} className="text-[10px] text-slate-600 dark:text-slate-400 leading-tight ml-2">
                                          • {item.name}
                                          {item.primaryArchitect && (
                                            <span className="text-slate-500 dark:text-slate-500 ml-1">
                                              - {item.primaryArchitect}
                                            </span>
                                          )}
                                        </div>
                                      ))}
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
                                                <div className="text-slate-500">
                                                  Assigned: <button
                                                    onClick={(e) => {
                                                      e.stopPropagation()
                                                      onEditPerson?.(task.assignedTo!)
                                                    }}
                                                    className="text-blue-600 dark:text-blue-400 hover:underline"
                                                  >
                                                    {task.assignedTo}
                                                  </button>
                                                </div>
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
          {teamFilter === 'Architecture' && itemsWithSkillsGaps.length > 0 && (
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

