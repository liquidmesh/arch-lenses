import { useState, useRef, useEffect } from 'react'

interface AutocompleteInputProps {
  value: string
  onChange: (value: string) => void
  suggestions: string[]
  placeholder?: string
  className?: string
  onBlur?: () => void
}

export function AutocompleteInput({ 
  value, 
  onChange, 
  suggestions, 
  placeholder, 
  className = '',
  onBlur 
}: AutocompleteInputProps) {
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (value && suggestions.length > 0) {
      const filtered = suggestions.filter(s => 
        s.toLowerCase().includes(value.toLowerCase()) && s.toLowerCase() !== value.toLowerCase()
      )
      setFilteredSuggestions(filtered.slice(0, 10)) // Limit to 10 suggestions
      setShowSuggestions(filtered.length > 0)
    } else {
      setFilteredSuggestions([])
      setShowSuggestions(false)
    }
  }, [value, suggestions])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  function handleSelect(suggestion: string) {
    onChange(suggestion)
    setShowSuggestions(false)
    inputRef.current?.focus()
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => {
          if (filteredSuggestions.length > 0) {
            setShowSuggestions(true)
          }
        }}
        onBlur={() => {
          // Delay to allow click on suggestion
          setTimeout(() => {
            setShowSuggestions(false)
            onBlur?.()
          }, 200)
        }}
        placeholder={placeholder}
        className={className}
      />
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded shadow-lg max-h-60 overflow-y-auto"
        >
          {filteredSuggestions.map((suggestion, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSelect(suggestion)}
              className="w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-slate-700 dark:text-slate-300"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Comma-separated autocomplete: suggests on the last token and appends a comma+space after selection
interface CommaSeparatedAutocompleteInputProps {
  value: string
  onChange: (value: string) => void
  suggestions: string[]
  placeholder?: string
  className?: string
}

export function CommaSeparatedAutocompleteInput({
  value,
  onChange,
  suggestions,
  placeholder,
  className = '',
}: CommaSeparatedAutocompleteInputProps) {
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  // Compute current token (last segment after comma)
  const currentToken = value.split(',').slice(-1)[0]?.trimStart() ?? ''
  const baseParts = value.split(',').slice(0, -1).map(p => p.trim()).filter(Boolean)

  useEffect(() => {
    if (suggestions.length === 0) {
      setFilteredSuggestions([])
      setShowSuggestions(false)
      return
    }

    const needle = currentToken.toLowerCase()
    const filtered = suggestions
      .filter(s => {
        if (!needle) return true
        return s.toLowerCase().includes(needle)
      })
      .filter(s => s) // guard empty
      .slice(0, 10)

    setFilteredSuggestions(filtered)
    setShowSuggestions(filtered.length > 0 && currentToken.length > 0)
  }, [currentToken, value, suggestions])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  function handleSelect(suggestion: string) {
    const nextParts =
      currentToken.length > 0
        ? [...baseParts, suggestion]
        : [...baseParts, suggestion]
    const next = nextParts.join(', ')
    const finalValue = next
    onChange(finalValue)
    setShowSuggestions(false)
    inputRef.current?.focus()
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => {
          if (filteredSuggestions.length > 0) {
            setShowSuggestions(true)
          }
        }}
        onBlur={() => {
          setTimeout(() => setShowSuggestions(false), 200)
        }}
        placeholder={placeholder}
        className={className}
      />
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded shadow-lg max-h-60 overflow-y-auto"
        >
          {filteredSuggestions.map((suggestion, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSelect(suggestion)}
              className="w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-slate-700 dark:text-slate-300"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

