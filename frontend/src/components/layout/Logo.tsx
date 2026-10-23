import { cn } from '@/lib/utils'

/** SupHomey mark: a magnifying glass over a house (public/icon-192.png). */
export function BrandMark({ className }: { className?: string }) {
  return <img src="/icon-192.png" alt="" width={32} height={32} draggable={false} className={cn('size-8 select-none', className)} />
}

export function Logo({ showTagline = false }: { showTagline?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark className="size-8 sm:size-9" />
      <div className="leading-tight">
        <div className="text-sm font-semibold tracking-tight whitespace-nowrap text-brand-navy sm:text-[15px] dark:text-foreground">SupHomey</div>
        {showTagline && (
          <div className="hidden text-[11px] text-muted-foreground xl:block">Explore Houston. Understand Home Values.</div>
        )}
      </div>
    </div>
  )
}
