import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import { MapPinned, Radar, Wallet, type LucideIcon } from 'lucide-react'

export interface AppModule {
  id: string
  name: string
  description: string
  path: string
  icon: LucideIcon
  status: 'active' | 'coming-soon'
  /** Page component; omitted for modules that are not built yet. */
  page?: LazyExoticComponent<ComponentType>
}

/**
 * Product modules. To add Deal Radar or Affordability: build the page under src/pages,
 * set `status: 'active'` and point `page` at it. Navigation and routing pick it up.
 */
export const MODULES: AppModule[] = [
  {
    id: 'home-value',
    name: 'Home Value Explorer',
    description: 'Browse 2024 Houston listings on the map and compare them with AI valuations.',
    path: '/',
    icon: MapPinned,
    status: 'active',
    page: lazy(() => import('@/pages/HomeValueExplorer')),
  },
  {
    id: 'deal-radar',
    name: 'Deal Radar',
    description: 'Surface listings priced below their AI-estimated value.',
    path: '/deal-radar',
    icon: Radar,
    status: 'coming-soon',
  },
  {
    id: 'affordability',
    name: 'Affordability',
    description: 'Match homes to realistic monthly budgets, including Texas taxes and insurance.',
    path: '/affordability',
    icon: Wallet,
    status: 'coming-soon',
  },
]
