import { useEffect, useMemo, useState } from 'react'
import { db } from '../db'
import { type ItemRecord, type TeamMember, type LensKey, LENSES } from '../types'
import { Modal } from './Modal'

interface TeamModalProps {
  open: boolean
  onClose: () => void
  view: 'architects' | 'stakeholders'
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
}

type CoverageGroup = 'high' | 'medium' | 'low' | 'none' | 'all'


export function TeamModal({ open, onClose, view }: TeamModalProps) {
  const [items, setItems] = useState<ItemRecord[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])

  useEffect(() => {
    if (!open) return
    ;(async () => {
      const [allItems, allMembers] = await Promise.all([
        db.items.toArray(),
        db.teamMembers.toArray(),
      ])
      setItems(allItems)
      setTeamMembers(allMembers)
    })()
  }, [open])

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
          })
        }
        const person = coverage.get(name)!
        person.techContactCount++
        person.techContactItems.push({ item, lens: lensLabel })
      }
    })

    // Calculate total coverage
    coverage.forEach(person => {
      if (view === 'architects') {
        person.totalCoverage = person.primaryCount + person.secondaryCount
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

  // Calculate relationships between people (for architects view only)
  const relationships = useMemo(() => {
    if (view !== 'architects') return []
    
    const rels: Relationship[] = []
    const personMap = new Map<string, PersonCoverage>()
    
    personCoverage.forEach(person => {
      personMap.set(person.name, person)
    })

    // Manager relationships
    personCoverage.forEach(person => {
      if (person.manager) {
        // Check if manager is also in the team
        if (personMap.has(person.manager)) {
          rels.push({ from: person.name, to: person.manager, type: 'manager' })
        }
      }
    })

    // Shared item relationships (people working on the same items)
    const itemToPeople = new Map<number, Set<string>>()
    items.forEach(item => {
      if (item.id) {
        const people = new Set<string>()
        if (item.primaryArchitect) people.add(item.primaryArchitect.trim())
        item.secondaryArchitects.forEach(arch => {
          const name = arch.trim()
          if (name) people.add(name)
        })
        if (people.size > 1) {
          itemToPeople.set(item.id, people)
        }
      }
    })

    itemToPeople.forEach((peopleSet, itemId) => {
      const peopleArray = Array.from(peopleSet)
      for (let i = 0; i < peopleArray.length; i++) {
        for (let j = i + 1; j < peopleArray.length; j++) {
          const person1 = peopleArray[i]
          const person2 = peopleArray[j]
          // Only add if both are in the team
          if (personMap.has(person1) && personMap.has(person2)) {
            rels.push({ from: person1, to: person2, type: 'shared-item' })
          }
        }
      }
    })

    return rels
  }, [personCoverage, items, view])

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
      managerGroup.forEach((people, group) => {
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

  function getCoverageColor(person: PersonCoverage): string {
    if (view === 'architects') {
      if (person.hasPrimary) {
        if (person.totalCoverage >= 5) return 'bg-blue-100 dark:bg-blue-900 border-blue-300 dark:border-blue-700'
        if (person.totalCoverage >= 2) return 'bg-green-100 dark:bg-green-900 border-green-300 dark:border-green-700'
        return 'bg-yellow-100 dark:bg-yellow-900 border-yellow-300 dark:border-yellow-700'
      } else {
        // Secondary only
        if (person.secondaryCount >= 3) return 'bg-purple-100 dark:bg-purple-900 border-purple-300 dark:border-purple-700'
        if (person.secondaryCount >= 1) return 'bg-orange-100 dark:bg-orange-900 border-orange-300 dark:border-orange-700'
        return 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700'
      }
    } else {
      // Stakeholders
      const total = person.businessContactCount + person.techContactCount
      if (total >= 5) return 'bg-blue-100 dark:bg-blue-900 border-blue-300 dark:border-blue-700'
      if (total >= 2) return 'bg-green-100 dark:bg-green-900 border-green-300 dark:border-green-700'
      if (total >= 1) return 'bg-yellow-100 dark:bg-yellow-900 border-yellow-300 dark:border-yellow-700'
      return 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700'
    }
  }

  function getCoverageLabel(person: PersonCoverage): string {
    if (view === 'architects') {
      if (person.hasPrimary) {
        if (person.totalCoverage >= 5) return 'High Coverage (Key)'
        if (person.totalCoverage >= 2) return 'Medium Coverage (Key)'
        return 'Low Coverage (Key)'
      } else {
        if (person.secondaryCount >= 3) return 'Medium (Secondary Only)'
        if (person.secondaryCount >= 1) return 'Low (Secondary Only)'
        return 'No Coverage'
      }
    } else {
      const total = person.businessContactCount + person.techContactCount
      if (total >= 5) return 'High Coverage'
      if (total >= 2) return 'Medium Coverage'
      if (total >= 1) return 'Low Coverage'
      return 'No Coverage'
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={view === 'architects' ? 'Architecture Team Structure' : 'Stakeholder Structure'} fullScreen>
      <div className="h-full flex flex-col overflow-hidden">
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
                // Always show "No Coverage" section for architects view, even if empty
                if (people.length === 0 && !(view === 'architects' && coverageGroup === 'none')) return null

                return (
                  <div key={coverageGroup} className="mb-3">
                    {view === 'architects' && (
                      <h4 className="text-xs font-medium mb-1.5 text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                        {coverageGroup === 'high' ? 'High Coverage' :
                         coverageGroup === 'medium' ? 'Medium Coverage' :
                         coverageGroup === 'low' ? 'Low Coverage' : 'No Coverage'}
                      </h4>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2">
                      {people.map(person => (
                        <div
                          key={person.name}
                          className={`p-2 rounded border-2 ${getCoverageColor(person)} ${
                            view === 'architects' && !person.hasPrimary && person.secondaryCount > 0 ? 'border-dashed' : ''
                          } bg-white dark:bg-slate-900`}
                        >
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <div className="font-semibold text-sm text-slate-800 dark:text-slate-200">
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
                                <div>
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
          </div>
        </div>
      </div>
    </Modal>
  )
}

