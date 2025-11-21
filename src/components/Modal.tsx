import { useEffect } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  footer?: React.ReactNode
  fullScreen?: boolean
  wide?: boolean
}

export function Modal({ open, onClose, title, children, footer, fullScreen, wide }: ModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-stretch">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={fullScreen ? 'relative m-0 w-full h-full' : `relative w-full ${wide ? 'max-w-5xl' : 'max-w-2xl'} mx-4 my-auto max-h-[calc(100vh-2rem)] flex`}>
        <div className={(fullScreen ? 'h-full' : 'max-h-full') + ' rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg flex flex-col overflow-hidden w-full'}>
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center shrink-0">
            <h3 className="font-semibold text-base">{title}</h3>
            <button className="ml-auto px-2 py-1 text-sm" onClick={onClose}>Close</button>
          </div>
          <div className={fullScreen ? 'flex-1 p-0 overflow-hidden min-h-0' : 'flex-1 min-h-0 p-4 overflow-y-auto'}>
            {children}
          </div>
          {footer && !fullScreen && (
            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 justify-end">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
