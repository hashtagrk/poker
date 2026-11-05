import { formatMoney, type FormatMoneyOptions } from '../../lib/money'
import type { Cents } from '../../lib/types'

type MoneyProps = FormatMoneyOptions & {
  cents: Cents
  currency: string
  /** Colour by sign, force gold, or leave neutral. */
  tone?: 'sign' | 'gold' | 'neutral'
  display?: boolean
  className?: string
}

export function Money({ cents, currency, tone = 'neutral', display = false, className = '', ...format }: MoneyProps) {
  const toneClass = tone === 'gold' ? 'money--gold' : tone === 'sign' && cents > 0 ? 'money--pos' : tone === 'sign' && cents < 0 ? 'money--neg' : ''
  return <span className={`money ${toneClass} ${display ? 'money--display' : ''} ${className}`}>{formatMoney(cents, currency, format)}</span>
}
