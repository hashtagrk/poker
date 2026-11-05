import type { Cents } from './types'

const CENTS_PER_UNIT = 100

/**
 * Parses a user-typed amount ("20", "20.5", "1,250.75", "$40") into integer cents.
 * Returns null for anything that is not a non-negative amount with at most 2 decimals.
 */
export function parseAmount(input: string): Cents | null {
  const cleaned = input
    .trim()
    .replace(/[,\s]/g, '')
    .replace(/^[^\d.-]+/, '')
  if (cleaned === '' || cleaned === '.') return null
  if (!/^\d*(\.\d{0,2})?$/.test(cleaned)) return null
  const [whole = '0', fraction = ''] = cleaned.split('.')
  const wholeCents = Number.parseInt(whole === '' ? '0' : whole, 10) * CENTS_PER_UNIT
  const fractionCents = Number.parseInt(fraction.padEnd(2, '0'), 10)
  const cents = wholeCents + fractionCents
  return Number.isSafeInteger(cents) ? cents : null
}

export function centsToUnits(cents: Cents): number {
  return cents / CENTS_PER_UNIT
}

export function unitsToCents(units: number): Cents {
  return Math.round(units * CENTS_PER_UNIT)
}

export const DEFAULT_CURRENCY = '₹'
export const DEFAULT_BUY_IN: Cents = 150000

const CURRENCY_ALIASES: Readonly<Record<string, string>> = {
  INR: '₹',
  RS: '₹',
  'RS.': '₹',
  RUPEE: '₹',
  RUPEES: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
}

/** Maps typed currency codes ("INR", "Rs") to their symbol; falls back to the default when empty. */
export function normalizeCurrency(input: string): string {
  const trimmed = input.trim()
  if (trimmed === '') return DEFAULT_CURRENCY
  return CURRENCY_ALIASES[trimmed.toUpperCase()] ?? trimmed
}

/** Rupees use lakh/crore grouping (1,00,000); everything else uses thousands. */
function groupingLocale(currency: string): string {
  return currency === '₹' || currency.toUpperCase() === 'INR' || currency.toUpperCase() === 'RS' ? 'en-IN' : 'en-US'
}

export type FormatMoneyOptions = {
  /** Show an explicit sign for positive values ("+$20.00"). */
  signed?: boolean
  /** Hide the trailing ".00" when the amount is whole. */
  compact?: boolean
}

/** Formats cents as a currency string. Negative values use a true minus sign. */
export function formatMoney(cents: Cents, currency: string, options: FormatMoneyOptions = {}): string {
  const abs = Math.abs(cents)
  const whole = Math.floor(abs / CENTS_PER_UNIT)
  const fraction = abs % CENTS_PER_UNIT
  const wholeText = whole.toLocaleString(groupingLocale(currency))
  const showFraction = !(options.compact && fraction === 0)
  const body = showFraction ? `${wholeText}.${fraction.toString().padStart(2, '0')}` : wholeText
  const sign = cents < 0 ? '−' : options.signed && cents > 0 ? '+' : ''
  return `${sign}${currency}${body}`
}

export function sumCents(values: Iterable<Cents>): Cents {
  let total = 0
  for (const value of values) total += value
  return total
}

export function isValidCents(value: unknown): value is Cents {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
