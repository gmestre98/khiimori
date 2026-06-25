import { type SelectHTMLAttributes, forwardRef } from 'react'

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid, className = '', children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={['form-select', invalid ? 'form-select--invalid' : '', className]
        .filter(Boolean)
        .join(' ')}
      aria-invalid={invalid ? 'true' : undefined}
      {...rest}
    >
      {children}
    </select>
  )
})
