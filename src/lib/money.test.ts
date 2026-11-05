import { describe, expect, test } from 'vitest'
import { formatMoney, normalizeCurrency, parseAmount, sumCents } from './money'

describe('parseAmount', () => {
  test('parses whole and fractional amounts into cents', () => {
    expect(parseAmount('20')).toBe(2000)
    expect(parseAmount('20.5')).toBe(2050)
    expect(parseAmount('0.07')).toBe(7)
    expect(parseAmount('1,250.75')).toBe(125075)
  })

  test('tolerates currency symbols and whitespace', () => {
    expect(parseAmount(' $40 ')).toBe(4000)
    expect(parseAmount('€12.30')).toBe(1230)
  })

  test('rejects garbage, negatives, and more than two decimals', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount('-5')).toBeNull()
    expect(parseAmount('1.234')).toBeNull()
    expect(parseAmount('.')).toBeNull()
  })

  test('accepts zero', () => {
    expect(parseAmount('0')).toBe(0)
    expect(parseAmount('0.00')).toBe(0)
  })
})

describe('formatMoney', () => {
  test('formats cents with thousands separators', () => {
    expect(formatMoney(123450, '$')).toBe('$1,234.50')
    expect(formatMoney(0, '$')).toBe('$0.00')
  })

  test('uses a true minus sign and optional plus sign', () => {
    expect(formatMoney(-500, '$')).toBe('−$5.00')
    expect(formatMoney(500, '$', { signed: true })).toBe('+$5.00')
    expect(formatMoney(0, '$', { signed: true })).toBe('$0.00')
  })

  test('uses Indian grouping for rupees', () => {
    expect(formatMoney(12345600, '₹')).toBe('₹1,23,456.00')
    expect(formatMoney(12345600, '$')).toBe('$123,456.00')
  })

  test('compact mode drops .00 only for whole amounts', () => {
    expect(formatMoney(2000, '£', { compact: true })).toBe('£20')
    expect(formatMoney(2050, '£', { compact: true })).toBe('£20.50')
  })
})

describe('normalizeCurrency', () => {
  test('maps codes to symbols and defaults to rupees', () => {
    expect(normalizeCurrency('INR')).toBe('₹')
    expect(normalizeCurrency(' rs ')).toBe('₹')
    expect(normalizeCurrency('usd')).toBe('$')
    expect(normalizeCurrency('')).toBe('₹')
    expect(normalizeCurrency('kr')).toBe('kr')
  })
})

test('sumCents adds an iterable of cents', () => {
  expect(sumCents([100, 250, 50])).toBe(400)
  expect(sumCents([])).toBe(0)
})
