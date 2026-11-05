import { useCallback, useEffect, useRef, useState } from 'react'
import { notify } from '../store/toastStore'

const COPIED_RESET_MS = 1800

export function useClipboard(): { copied: boolean; copy: (text: string) => Promise<void> } {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), COPIED_RESET_MS)
    } catch {
      notify('Clipboard is unavailable in this browser', 'error')
    }
  }, [])

  return { copied, copy }
}
