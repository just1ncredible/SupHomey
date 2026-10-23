import { cn } from '@/lib/utils'

/** HomeScope mark: a lens framing a house roofline. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--brand-navy)" />
      <circle cx="14.5" cy="14.5" r="7.5" fill="none" stroke="var(--brand-teal)" strokeWidth="2.2" />
      <path d="m20 20 5 5" stroke="var(--brand-teal)" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M10.8 15.2 14.5 11.8l3.7 3.4v3.6h-7.4Z" fill="#fff" />
    </svg>
  )
}

export function Logo({ showTagline = false }: { showTagline?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark className="size-7 sm:size-8" />
      <div className="leading-tight">
        <div className="text-sm font-semibold tracking-tight whitespace-nowrap text-brand-navy sm:text-[15px]">HomeScope</div>
        {showTagline && (
          <div className="hidden text-[11px] text-muted-foreground xl:block">Explore Houston. Understand Home Values.</div>
        )}
      </div>
    </div>
  )
}
