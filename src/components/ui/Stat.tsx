import type { ReactNode } from 'react'

export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="stat">
      <span className="eyebrow">{label}</span>
      <span className="stat__value">{children}</span>
    </div>
  )
}
