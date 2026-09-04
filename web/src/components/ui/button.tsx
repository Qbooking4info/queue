'use client'
import { ButtonHTMLAttributes, forwardRef } from 'react'
import { clsx } from 'clsx'
import { useTheme } from '@/contexts/ThemeContext'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

// Had zero consumers when found -- every dashboard page hand-rolled its own <button>
// with its own Tailwind classes instead. It was also broken: 'bg-green-500'/
// 'text-red-400' are static Tailwind utility classes, which can't react to the
// clinical/forest toggle the rest of the dashboard runs on (that's exactly why every
// other themed dashboard component -- Badge.tsx included -- reads colors off
// useTheme() into an inline style instead of a static class). Tailwind classes stay
// for the theme-independent structural bits (padding scale, radius, transition,
// spinner, disabled state); color now comes from the live theme.
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, className, children, disabled, style, ...props }, ref) => {
    const { theme: C } = useTheme()
    const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50 disabled:cursor-not-allowed'
    const sizes = {
      sm: 'px-3 py-1.5 text-xs',
      md: 'px-4 py-2.5 text-sm',
      lg: 'px-6 py-3.5 text-base',
    }
    // forest's accent (#00E87A) is bright enough that white text on it reads worse
    // than near-black -- LinkDoctorModal and others had already independently
    // hand-wrote the same `C.id === 'forest' ? '#061208' : '#fff'` check (matching
    // the identical convention found on the mobile side of this same fix).
    const onPrimary = C.id === 'forest' ? '#061208' : '#fff'
    const variantStyle: React.CSSProperties = {
      primary: { background: C.accent, color: onPrimary },
      outline: { background: 'transparent', border: `1px solid ${C.border}`, color: C.textSub },
      ghost:   { background: 'transparent', color: C.textMuted },
      danger:  { background: C.redLight, color: C.red, border: `1px solid ${C.redLight}` },
    }[variant]
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={clsx(base, sizes[size], className)}
        style={{ ...variantStyle, ...style }}
        {...props}
      >
        {loading && <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'
