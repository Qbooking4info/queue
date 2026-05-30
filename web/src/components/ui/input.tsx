'use client'
import { InputHTMLAttributes, forwardRef } from 'react'
import { clsx } from 'clsx'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  leftIcon?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, leftIcon, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')
    return (
      <div className="flex flex-col gap-1.5">
        {label && <label htmlFor={inputId} className="text-sm font-medium text-gray-300">{label}</label>}
        <div className="relative">
          {leftIcon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">{leftIcon}</span>}
          <input
            ref={ref}
            id={inputId}
            className={clsx(
              'w-full bg-white/5 border rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-600',
              'focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500/50 transition-all',
              error ? 'border-red-500/50' : 'border-white/10 hover:border-white/20',
              leftIcon && 'pl-10',
              className
            )}
            {...props}
          />
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        {hint  && !error && <p className="text-xs text-gray-600">{hint}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'
