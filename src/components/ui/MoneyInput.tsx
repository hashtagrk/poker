import type { InputHTMLAttributes } from 'react'

type MoneyInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'size'> & {
  currency: string
  value: string
  onChange: (value: string) => void
  invalid?: boolean
  size?: 'md' | 'lg'
}

export function MoneyInput({ currency, value, onChange, invalid = false, size = 'md', className = '', ...rest }: MoneyInputProps) {
  return (
    <span className={`money-input ${size === 'lg' ? 'money-input--lg' : ''} ${className}`}>
      <span className="money-input__prefix" aria-hidden="true">
        {currency}
      </span>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className="input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid || undefined}
        placeholder="0.00"
        {...rest}
      />
    </span>
  )
}
