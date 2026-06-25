import { type ReactNode } from 'react'

export interface FormFieldProps {
  /** The <label> text. Required — never omit for accessibility. */
  label: string
  /** Associates the label with the field via htmlFor / id. */
  htmlFor?: string
  /** Optional hint shown below the label. */
  hint?: string
  /** Validation error — shown below the field and wires up aria-describedby. */
  error?: string | null
  children: ReactNode
  className?: string
}

export function FormField({
  label,
  htmlFor,
  hint,
  error,
  children,
  className = '',
}: FormFieldProps) {
  const errorId = error && htmlFor ? `${htmlFor}-error` : undefined
  const hintId = hint && htmlFor ? `${htmlFor}-hint` : undefined

  return (
    <div className={['form-field', className].filter(Boolean).join(' ')}>
      <label className="form-field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {hint && (
        <span id={hintId} className="form-field-hint">
          {hint}
        </span>
      )}
      {children}
      {error && (
        <span id={errorId} role="alert" className="form-field-error">
          {error}
        </span>
      )}
    </div>
  )
}
