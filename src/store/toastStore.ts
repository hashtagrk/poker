import { create } from 'zustand'
import { createId } from '../lib/id'

export type ToastTone = 'info' | 'success' | 'error'
export type Toast = { id: string; message: string; tone: ToastTone }

type ToastState = {
  toasts: readonly Toast[]
  push: (message: string, tone?: ToastTone) => void
  dismiss: (id: string) => void
}

export const TOAST_DURATION_MS = 4200

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (message, tone = 'info') => {
    const toast: Toast = { id: createId(), message, tone }
    set((state) => ({ toasts: [...state.toasts.slice(-3), toast] }))
    setTimeout(() => get().dismiss(toast.id), TOAST_DURATION_MS)
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}))

export const notify = (message: string, tone?: ToastTone) => useToastStore.getState().push(message, tone)
