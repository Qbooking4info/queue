'use client'
export function SkeletonRow({ height = 48, mb = 8 }: { height?: number; mb?: number }) {
  return (
    <div style={{
      height, borderRadius: 10, marginBottom: mb,
      background: 'linear-gradient(90deg, var(--skeleton-a) 25%, var(--skeleton-b) 50%, var(--skeleton-a) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.4s infinite',
    }} />
  )
}
