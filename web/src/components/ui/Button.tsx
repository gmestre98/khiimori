import { type ButtonHTMLAttributes, forwardRef } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost' | 'ghost-danger'
export type ButtonSize = 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

const variantClass: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  destructive: 'btn-danger',
  ghost: 'btn-ghost',
  'ghost-danger': 'btn-ghost-danger',
}

const sizeClass: Record<ButtonSize, string> = {
  sm: 'btn-sm',
  md: '',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className = '', children, type = 'button', ...rest },
  ref,
) {
  const cls = [variantClass[variant], sizeClass[size], className].filter(Boolean).join(' ')
  return (
    <button ref={ref} type={type} className={cls} {...rest}>
      {children}
    </button>
  )
})
