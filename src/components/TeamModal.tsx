import { useEffect, useMemo, useState, useRef } from 'react'
import { db, getAllItemNames } from '../db'
import { type ItemRecord, type TeamMember, type MeetingNote, type Task, LENSES, type LensKey } from '../types'
type ViewType = 'main' | 'diagram' | 'architects' | 'stakeholders' | 'manage-team' | 'meeting-notes'

interface TeamModalProps {
  onEditPerson?: (personName: string) => void
  refreshKey?: number
  onOpenMeetingNote?: (noteId: number) => void
  onNavigate: (view: ViewType) => void
  visible?: Record<LensKey, boolean>
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

// Helper function to recursively find all reports at any level below a manager
function getAllReports(managerName: string, teamMembers: TeamMember[]): Set<string> {
  const reports = new Set<string>()
  const directReports = teamMembers.filter(m => m.manager === managerName)
  
  directReports.forEach(report => {
    reports.add(report.name)
    // Recursively get reports of this report
    const subReports = getAllReports(report.name, teamMembers)
    subReports.forEach(subReport => reports.add(subReport))
  })
  
  return reports
}

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

export function TeamModal({ onEditPerson, refreshKey, onOpenMeetingNote, onNavigate: _onNavigate, visible }: TeamModalProps) {
  const [teamFilter, setTeamFilter] = useState<'All' | 'Architecture' | 'Business Stakeholders' | 'Tech Stakeholders' | 'All Stakeholders'>('Architecture')
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
    const visibleLenses = visible || {}

    // Initialize with team members based on team filter
    const shouldIncludeAll = teamFilter === 'All'
    const shouldIncludeArchitecture = teamFilter === 'Architecture' || shouldIncludeAll
    const shouldIncludeBusiness = teamFilter === 'Business Stakeholders' || teamFilter === 'All Stakeholders' || shouldIncludeAll
    const shouldIncludeTech = teamFilter === 'Tech Stakeholders' || teamFilter === 'All Stakeholders' || shouldIncludeAll
    
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
    // Filter items to only include those from visible lenses
    const visibleItems = items.filter(item => {
      // If visible prop is not provided or empty, show all items (backward compatibility)
      if (!visibleLenses || Object.keys(visibleLenses).length === 0) return true
      // Only include items from lenses that are explicitly set to true
      // If a lens key doesn't exist in visibleLenses, default to showing it (for new lenses)
      const lensKey = item.lens as LensKey
      const isVisible = visibleLenses[lensKey]
      // Explicitly false means hidden, true means visible, undefined means show (new lens)
      return isVisible !== false
    })
    
    visibleItems.forEach(item => {
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
    const isArchitectureView = teamFilter === 'Architecture' || teamFilter === 'All'
    
    coverage.forEach(person => {
      if (isArchitectureView) {
        person.totalCoverage = person.primaryCount + person.secondaryCount
        
        // Check if person has direct reports
        const directReports = teamMembers.filter(m => m.manager === person.name)
        person.hasDirectReports = directReports.length > 0
        
        // Collect team items (items where direct reports are primary or secondary)
        // Only include items from visible lenses (consistent with person's own items)
        if (person.hasDirectReports) {
          const directReportNames = new Set(directReports.map(m => m.name))
          const teamItemSet = new Set<number>() // Use Set to avoid duplicates
          
          visibleItems.forEach(item => {
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
    const shouldShowAll = teamFilter === 'All'
    const shouldShowArchitecture = teamFilter === 'Architecture' || shouldShowAll
    const shouldShowBusiness = teamFilter === 'Business Stakeholders' || teamFilter === 'All Stakeholders' || shouldShowAll
    const shouldShowTech = teamFilter === 'Tech Stakeholders' || teamFilter === 'All Stakeholders' || shouldShowAll
    
    let filtered = Array.from(coverage.values()).filter(person => {
      const member = teamMembers.find(m => m.name === person.name)
      const memberTeam = member?.team || 'Architecture'
      
      // If "All" is selected, show everyone
      if (shouldShowAll) {
        return true
      }
      
      if (shouldShowArchitecture && !shouldShowBusiness && !shouldShowTech) {
        // Show architecture team members only
        return memberTeam === 'Architecture' && (person.primaryCount > 0 || person.secondaryCount > 0 || member)
      } else if (shouldShowBusiness && shouldShowTech && !shouldShowArchitecture) {
        // Show all stakeholders
        return (memberTeam === 'Business Stakeholder' || memberTeam === 'Tech Stakeholder') &&
               (person.businessContactCount > 0 || person.techContactCount > 0)
      } else if (shouldShowBusiness && !shouldShowTech && !shouldShowArchitecture) {
        // Show only business stakeholders
        return memberTeam === 'Business Stakeholder' && person.businessContactCount > 0
      } else if (shouldShowTech && !shouldShowBusiness && !shouldShowArchitecture) {
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
        // Get all reports at any level below the selected manager (recursive)
        const allReports = getAllReports(managerFilter, teamMembers)
        // Include the selected manager and all their reports
        filtered = filtered.filter(person => 
          person.name === managerFilter || allReports.has(person.name)
        )
      }
    }

        return filtered
      }, [items, teamMembers, teamFilter, managerFilter, visible])

  // Group by manager, then by coverage
  // When manager filter is active, show hierarchical structure
  const groupedPeople = useMemo(() => {
    const groups = new Map<string | undefined, Map<CoverageGroup, PersonCoverage[]>>()
    const isArchitectureView = teamFilter === 'Architecture' || teamFilter === 'All'

    personCoverage.forEach(person => {
      // For stakeholders, group by type (business vs tech) if they have both, otherwise by "No Category"
      let manager: string | undefined
      if (isArchitectureView) {
        // When manager filter is active, group by immediate manager for hierarchical display
        // Otherwise, group by their manager as usual
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
  }, [personCoverage, teamFilter, managerFilter])
  
  // Build hierarchical structure when manager filter is active
  const hierarchicalStructure = useMemo(() => {
    if (managerFilter === 'All' || managerFilter === 'Unassigned' || teamFilter !== 'Architecture') {
      return null // Don't use hierarchy when filter is not active or not in Architecture view
    }
    
    // Build a map of person name to PersonCoverage
    const personMap = new Map<string, PersonCoverage>()
    personCoverage.forEach(person => {
      personMap.set(person.name, person)
    })
    
    // Build hierarchy: manager -> direct reports -> their reports, etc.
    interface HierarchyNode {
      person: PersonCoverage
      level: number
      children: HierarchyNode[]
    }
    
    function buildHierarchy(managerName: string, level: number): HierarchyNode[] {
      const nodes: HierarchyNode[] = []
      const directReports = personCoverage.filter(p => p.manager === managerName)
      
      directReports.forEach(report => {
        const children = buildHierarchy(report.name, level + 1)
        nodes.push({
          person: report,
          level,
          children
        })
      })
      
      return nodes.sort((a, b) => a.person.name.localeCompare(b.person.name))
    }
    
    // Start with the selected manager
    const selectedManager = personMap.get(managerFilter)
    if (!selectedManager) return null
    
    const root: HierarchyNode = {
      person: selectedManager,
      level: 0,
      children: buildHierarchy(managerFilter, 1)
    }
    
    return root
  }, [personCoverage, managerFilter, teamFilter])
  
  // Get unique manager names for filter dropdown - filtered by team
  const managerNames = useMemo(() => {
    const managers = new Set<string>()
    
    // Use the same team filtering logic as personCoverage
    const shouldIncludeAll = teamFilter === 'All'
    const shouldIncludeArchitecture = teamFilter === 'Architecture' || shouldIncludeAll
    const shouldIncludeBusiness = teamFilter === 'Business Stakeholders' || teamFilter === 'All Stakeholders' || shouldIncludeAll
    const shouldIncludeTech = teamFilter === 'Tech Stakeholders' || teamFilter === 'All Stakeholders' || shouldIncludeAll
    
    // Get all team members in the selected team
    const teamMembersInFilter = teamMembers.filter((m: TeamMember) => {
      const memberTeam = m.team || 'Architecture'
      return (
        (shouldIncludeArchitecture && memberTeam === 'Architecture') ||
        (shouldIncludeBusiness && memberTeam === 'Business Stakeholder') ||
        (shouldIncludeTech && memberTeam === 'Tech Stakeholder')
      )
    })
    
    // Only include managers who are themselves in the selected team
    // Check if each person in the selected team is a manager (someone reports to them)
    teamMembersInFilter.forEach((m: TeamMember) => {
      // Check if this person is a manager (someone in the selected team reports to them)
      const isManager = teamMembersInFilter.some(other => other.manager === m.name)
      if (isManager) {
        managers.add(m.name)
      }
    })
    
    return Array.from(managers).sort()
  }, [teamMembers, teamFilter])

  // Get items with skills gaps for the "New" box
  const itemsWithSkillsGaps = useMemo(() => {
    const visibleLenses = visible || {}
    return items.filter(item => {
      // If visible prop is not provided or empty, show all items (backward compatibility)
      if (!visibleLenses || Object.keys(visibleLenses).length === 0) {
        return item.skillsGaps && item.skillsGaps.trim().length > 0
      }
      // Only include items from lenses that are not explicitly set to false
      // If a lens key doesn't exist in visibleLenses, default to showing it (for new lenses)
      const lensKey = item.lens as LensKey
      const isVisible = visibleLenses[lensKey]
      // Explicitly false means hidden, true/undefined means visible
      if (isVisible === false) {
        return false
      }
      return item.skillsGaps && item.skillsGaps.trim().length > 0
    })
  }, [items, visible])

  function getCoverageColor(): string {
    // All boxes use white background with standard border
    return 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700'
  }

  // Helper function to render a person box
  function renderPersonBox(person: PersonCoverage, indentLevel: number = 0, hideTeamInfo: boolean = false) {
    const indentStyle = indentLevel > 0 ? { marginLeft: `${indentLevel * 24}px` } : {}
    
    return (
      <div
        key={person.name}
        className={`p-2 rounded border-2 ${getCoverageColor()} ${
          teamFilter === 'Architecture' && !person.hasPrimary && person.secondaryCount > 0 ? 'border-dashed' : ''
        } bg-white dark:bg-slate-900 min-w-0`}
        style={indentStyle}
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
            {hideTeamInfo === false && person.hasDirectReports && person.teamItems.length > 0 && (
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
              const stakeholderTasks = tasks.filter(task => {
                if (task.completedAt) return false
                const note = meetingNotes.find(n => n.id === task.meetingNoteId)
                if (!note) return false
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
                              loadData()
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
    )
  }

  // Convert hierarchy to levels for tree structure rendering
  const hierarchyByLevel = useMemo(() => {
    if (!hierarchicalStructure) return []
    
    interface LevelNode {
      person: PersonCoverage
      parent?: string
      id: string
    }
    
    const levels: LevelNode[][] = []
    
    function collectByLevel(node: { person: PersonCoverage; level: number; children: Array<{ person: PersonCoverage; level: number; children: any[] }> }, parent?: string) {
      const level = node.level
      if (!levels[level]) {
        levels[level] = []
      }
      levels[level].push({
        person: node.person,
        parent,
        id: node.person.name
      })
      
      node.children.forEach(child => {
        collectByLevel(child, node.person.name)
      })
    }
    
    collectByLevel(hierarchicalStructure)
    return levels.filter(level => level.length > 0)
  }, [hierarchicalStructure])

  // State to track box positions for accurate line drawing
  const [boxPositions, setBoxPositions] = useState<Map<string, { x: number; y: number; width: number; height: number }>>(new Map())
  const boxRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // Container ref for position calculations
  const containerRef = useRef<HTMLDivElement>(null)

  // Update box positions after render
  useEffect(() => {
    if (hierarchyByLevel.length === 0) {
      setBoxPositions(new Map())
      return
    }
    
    const updatePositions = () => {
      const positions = new Map<string, { x: number; y: number; width: number; height: number }>()
      const container = containerRef.current
      
      if (!container) return
      
      const containerRect = container.getBoundingClientRect()
      
      // Check that we have refs for all expected boxes
      const expectedBoxCount = hierarchyByLevel.reduce((sum, level) => sum + level.length, 0)
      const actualRefCount = boxRefs.current.size
      
      // Wait for all boxes to be rendered
      if (actualRefCount < expectedBoxCount) {
        // Some refs aren't set yet, try again after a delay
        // Use a longer delay to ensure flex-wrap has completed layout
        setTimeout(updatePositions, 200)
        return
      }
      
      // Calculate positions for all boxes
      boxRefs.current.forEach((element, id) => {
        if (element) {
          const rect = element.getBoundingClientRect()
          positions.set(id, {
            x: rect.left - containerRect.left + rect.width / 2,
            y: rect.top - containerRect.top,
            width: rect.width,
            height: rect.height
          })
        }
      })
      
      // Only update if we have positions for all expected boxes
      if (positions.size === expectedBoxCount && positions.size > 0) {
        setBoxPositions(positions)
      } else if (positions.size > 0 && actualRefCount === expectedBoxCount) {
        // If we have all refs but some positions are missing, still update with what we have
        setBoxPositions(positions)
      }
    }
    
    // Update positions after layout is complete
    // Use multiple requestAnimationFrame calls and a timeout to ensure all boxes are rendered and laid out
    let frameId1: number
    let frameId2: number
    let frameId3: number
    let timeoutId: ReturnType<typeof setTimeout>
    
    frameId1 = requestAnimationFrame(() => {
      frameId2 = requestAnimationFrame(() => {
        frameId3 = requestAnimationFrame(() => {
          // Add an additional timeout to ensure flex-wrap layout is complete
          timeoutId = setTimeout(() => {
            updatePositions()
          }, 100)
        })
      })
    })
    
    window.addEventListener('resize', updatePositions)
    
    // Also use MutationObserver to detect when DOM changes
    const observer = new MutationObserver(() => {
      setTimeout(updatePositions, 150)
    })
    
    if (containerRef.current) {
      observer.observe(containerRef.current, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
      })
    }
    
    return () => {
      cancelAnimationFrame(frameId1)
      if (frameId2) cancelAnimationFrame(frameId2)
      if (frameId3) cancelAnimationFrame(frameId3)
      if (timeoutId) clearTimeout(timeoutId)
      window.removeEventListener('resize', updatePositions)
      observer.disconnect()
    }
  }, [hierarchyByLevel, personCoverage])

  // Render tree structure with relationship lines
  function renderTreeStructure() {
    if (!hierarchicalStructure || hierarchyByLevel.length === 0) return null
    
    return (
      <div ref={containerRef} className="tree-container relative">
        {/* SVG overlay for relationship lines - positioned absolutely to cover the container */}
        <svg 
          className="absolute top-0 left-0 w-full h-full pointer-events-none z-0"
          style={{ overflow: 'visible' }}
        >
          {hierarchyByLevel.slice(1).map((level, levelIndex) => {
            const actualLevel = levelIndex + 1
            const parentLevel = hierarchyByLevel[actualLevel - 1]
            
            return level.map((node) => {
              if (!node.parent) return null
              
              const parentNode = parentLevel.find(p => p.person.name === node.parent)
              if (!parentNode) return null
              
              const parentPos = boxPositions.get(parentNode.id)
              const childPos = boxPositions.get(node.id)
              
              // Only draw line if we have valid positions for both boxes
              if (!parentPos || !childPos || parentPos.height === 0 || childPos.height === 0) {
                return null
              }
              
              // Calculate line positions
              // Start from bottom center of parent box
              const startX = parentPos.x
              const startY = parentPos.y + parentPos.height
              
              // End at top center of child box
              const endX = childPos.x
              const endY = childPos.y
              
              // Calculate midpoint for horizontal connector
              const midY = (startY + endY) / 2
              
              // Only render if positions are valid (non-zero)
              if (startX === 0 && startY === 0 && endX === 0 && endY === 0) {
                return null
              }
              
              return (
                <g key={`line-${node.parent}-${node.person.name}`}>
                  {/* Vertical line from parent bottom */}
                  <line
                    x1={startX}
                    y1={startY}
                    x2={startX}
                    y2={midY}
                    stroke="#94a3b8"
                    strokeWidth="2"
                  />
                  {/* Horizontal connector */}
                  <line
                    x1={startX}
                    y1={midY}
                    x2={endX}
                    y2={midY}
                    stroke="#94a3b8"
                    strokeWidth="2"
                  />
                  {/* Vertical line to child top */}
                  <line
                    x1={endX}
                    y1={midY}
                    x2={endX}
                    y2={endY}
                    stroke="#94a3b8"
                    strokeWidth="2"
                  />
                </g>
              )
            }).filter(Boolean)
          })}
        </svg>
        
        {/* Person boxes by level */}
        <div className="relative z-10">
          {hierarchyByLevel.map((level, levelIndex) => (
            <div key={levelIndex} className="relative mb-8">
              {/* Person boxes in this level */}
              <div className="flex flex-wrap justify-center gap-4 items-start">
                {level.map((node) => (
                  <div 
                    key={node.id} 
                    ref={(el) => {
                      if (el) {
                        boxRefs.current.set(node.id, el)
                      } else {
                        boxRefs.current.delete(node.id)
                      }
                    }}
                    className="flex-shrink-0" 
                    style={{ width: '200px' }}
                  >
                    {renderPersonBox(node.person, 0, true)}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
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
            <option value="All">All</option>
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
          {hierarchicalStructure && managerFilter !== 'All' && managerFilter !== 'Unassigned' && (teamFilter === 'Architecture' || teamFilter === 'All') ? (
            // Tree structure view when manager filter is active
            <div className="mb-4">
              <h3 className="text-base font-semibold mb-3 text-slate-700 dark:text-slate-300">
                {managerFilter}
              </h3>
              {renderTreeStructure()}
            </div>
          ) : (
            // Standard grouped view
            Array.from(groupedPeople.entries())
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
              {(() => {
                if (teamFilter === 'Architecture' || teamFilter === 'All') {
                  // For Architecture view: separate people with coverage from those with no coverage
                  const peopleWithCoverage: PersonCoverage[] = []
                  const peopleWithNoCoverage: PersonCoverage[] = []
                  
                  // Collect people with coverage (high, medium, low)
                  ;(['high', 'medium', 'low'] as CoverageGroup[]).forEach(coverageGroup => {
                    const people = managerGroup.get(coverageGroup) || []
                    peopleWithCoverage.push(...people)
                  })
                  
                  // Collect people with no coverage
                  const noCoveragePeople = managerGroup.get('none') || []
                  peopleWithNoCoverage.push(...noCoveragePeople)

                  // If no people at all, return null
                  if (peopleWithCoverage.length === 0 && peopleWithNoCoverage.length === 0) return null

                  return (
                    <>
                      {/* People with coverage */}
                      {peopleWithCoverage.length > 0 && (
                        <div className="mb-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 auto-rows-min items-start">
                            {peopleWithCoverage.map(person => (
                        <div
                          key={person.name}
                          className={`p-2 rounded border-2 ${getCoverageColor()} ${
                            teamFilter === 'Architecture' && !person.hasPrimary && person.secondaryCount > 0 ? 'border-dashed' : ''
                          } bg-white dark:bg-slate-900 min-w-0`}
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
                        </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* People with no coverage - separate section */}
                      {peopleWithNoCoverage.length > 0 && (
                        <div className="mb-3">
                          <h4 className="text-xs font-medium mb-1.5 text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                            No Coverage
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 auto-rows-min items-start">
                            {peopleWithNoCoverage.map(person => (
                              <div
                                key={person.name}
                                className={`p-2 rounded border-2 ${getCoverageColor()} ${
                                  !person.hasPrimary && person.secondaryCount > 0 ? 'border-dashed' : ''
                                } bg-white dark:bg-slate-900 min-w-0`}
                              >
                                <div className="flex items-center gap-1.5 mb-1.5">
                                  <div 
                                    className="font-semibold text-sm text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
                                    onClick={() => onEditPerson?.(person.name)}
                                    title="Click to edit person"
                                  >
                                    {person.name}
                                  </div>
                                  {person.hasPrimary && (
                                    <span className="text-[10px] px-1 py-0.5 bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded">
                                      Key
                                    </span>
                                  )}
                                  {!person.hasPrimary && person.secondaryCount > 0 && (
                                    <span className="text-[10px] px-1 py-0.5 bg-purple-200 dark:bg-purple-800 text-purple-800 dark:text-blue-200 rounded">
                                      Sec
                                    </span>
                                  )}
                                </div>

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
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )
                } else {
                  // For stakeholders view: single grid for all people
                  const allPeople: PersonCoverage[] = []
                  const people = managerGroup.get('all') || []
                  allPeople.push(...people)

                  if (allPeople.length === 0) return null

                  return (
                    <div className="mb-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 auto-rows-min items-start">
                        {allPeople.map(person => (
                          <div
                            key={person.name}
                            className="p-2 rounded border-2 bg-white dark:bg-slate-900 min-w-0"
                          >
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <div 
                                className="font-semibold text-sm text-slate-800 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
                                onClick={() => onEditPerson?.(person.name)}
                                title="Click to edit person"
                              >
                                {person.name}
                              </div>
                            </div>
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
                                const stakeholderTasks = tasks.filter(task => {
                                  if (task.completedAt) return false
                                  const note = meetingNotes.find(n => n.id === task.meetingNoteId)
                                  if (!note) return false
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
                                                loadData()
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
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                }
              })()}
            </div>
          ))
          )}
          {/* "Skills Needed" box for items with skills gaps - only show in architects view, at the bottom */}
          {(teamFilter === 'Architecture' || teamFilter === 'All') && itemsWithSkillsGaps.length > 0 && (
            <div className="mb-4">
              <h3 className="text-base font-semibold mb-2 text-slate-700 dark:text-slate-300">
                Skills Needed
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 auto-rows-min items-start">
                {itemsWithSkillsGaps.map(item => {
                  const lensLabel = LENSES.find(l => l.key === item.lens)?.label || item.lens
                  return (
                    <div
                      key={item.id}
                      className="p-2 rounded border-2 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 min-w-0"
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

