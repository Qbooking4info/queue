'use client'
import { ButtonHTMLAttributes, forwardRef } from 'react'
import { clsx } from 'clsx'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, className, children, disabled, ...props }, ref) => {
    const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed'
    const variants = {
      primary: 'bg-green-500 hover:bg-green-400 text-white shadow-lg shadow-green-500/20',
      outline: 'border border-white/10 hover:border-white/20 text-gray-300 hover:text-white bg-transparent',
      ghost:   'text-gray-400 hover:text-white hover:bg-white/5',
      danger:  'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20',
    }
    const sizes = {
      sm: 'px-3 py-1.5 text-xs',
      md: 'px-4 py-2.5 text-sm',
      lg: 'px-6 py-3.5 text-base',
    }
    return (
      <button ref={ref} disabled={disabled || loading} className={clsx(base, variants[variant], sizes[size], className)} {...props}>
        {loading && <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'
