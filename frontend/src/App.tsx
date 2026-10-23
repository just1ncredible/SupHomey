import { Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'

import { TopNav } from '@/components/layout/TopNav'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppStatusProvider } from '@/context/AppStatus'
import { MODULES } from '@/modules/registry'

function PageFallback() {
  return <div className="flex-1 animate-pulse bg-muted/40" />
}

export default function App() {
  return (
    <BrowserRouter>
      <TooltipProvider delay={250}>
        <AppStatusProvider>
          <div className="flex h-dvh flex-col overflow-hidden">
            <TopNav />
            <main className="relative flex min-h-0 flex-1">
              <Suspense fallback={<PageFallback />}>
                <Routes>
                  {MODULES.filter((m) => m.status === 'active' && m.page).map((m) => {
                    const Page = m.page!
                    return <Route key={m.id} path={m.path} element={<Page />} />
                  })}
                  {/* Future modules are announced in the nav but not routable yet. */}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </main>
          </div>
        </AppStatusProvider>
      </TooltipProvider>
    </BrowserRouter>
  )
}
