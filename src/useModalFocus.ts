import { useEffect, useRef } from 'react'

export function useModalFocus<T extends HTMLElement = HTMLDivElement>(open: boolean, close?: () => void) {
  const container = useRef<T>(null)
  const closeRef = useRef(close)
  useEffect(() => { closeRef.current = close })
  useEffect(() => {
    if (!open || !container.current) return
    const root = container.current
    const previous = document.activeElement as HTMLElement | null
    const focusable = () => Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'))
    focusable()[0]?.focus()
    const keydown = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"]')
      if (dialogs[dialogs.length - 1] !== root) return
      if (event.key === 'Escape' && closeRef.current) { event.preventDefault(); closeRef.current() }
      if (event.key === 'Tab') {
        const items = focusable(), first = items[0], last = items[items.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    window.addEventListener('keydown', keydown)
    return () => { window.removeEventListener('keydown', keydown); if (previous?.isConnected) previous.focus() }
  }, [open])
  return container
}
