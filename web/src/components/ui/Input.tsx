import { type InputHTMLAttributes, forwardRef } from 'react'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Shows an error ring + aria-invalid when truthy. */
  invalid?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, className = '', ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={['form-input', invalid ? 'form-input--invalid' : '', className]
        .filter(Boolean)
        .join(' ')}
      aria-invalid={invalid ? 'true' : undefined}
      {...rest}
    />
  )
})
