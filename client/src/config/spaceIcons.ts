import type { LucideIcon } from 'lucide-react'
import {
  Bath,
  BedDouble,
  Building2,
  Car,
  Coffee,
  CookingPot,
  Droplets,
  Gauge,
  Key,
  Lock,
  Maximize,
  Monitor,
  Mountain,
  Shield,
  Snowflake,
  Sofa,
  Sparkles,
  Sun,
  Trees,
  Tv,
  Users,
  Utensils,
  WashingMachine,
  Wifi,
  Wind,
} from 'lucide-react'

/**
 * THE SPACE attribute icons.
 *
 * The admin picks an icon per attribute (or none) and the public property page
 * renders the matching lucide icon. These identifiers are persisted in the DB
 * and validated against THE SAME list server-side (`spaceValidation.ts`), so
 * the two lists must stay in lock step.
 */
export interface SpaceIconOption {
  id: string
  label: string
  icon: LucideIcon
}

export const SPACE_ICON_OPTIONS: SpaceIconOption[] = [
  { id: 'users', label: 'Guests', icon: Users },
  { id: 'bed', label: 'Bedrooms', icon: BedDouble },
  { id: 'bath', label: 'Bathrooms', icon: Bath },
  { id: 'interior', label: 'Interior size', icon: Maximize },
  { id: 'parking', label: 'Parking', icon: Car },
  { id: 'kitchen', label: 'Kitchen', icon: CookingPot },
  { id: 'floor', label: 'Floor', icon: Building2 },
  { id: 'terrace', label: 'Terrace', icon: Sun },
  { id: 'view', label: 'Views', icon: Mountain },
  { id: 'garden', label: 'Garden', icon: Trees },
  { id: 'wifi', label: 'Wi-Fi', icon: Wifi },
  { id: 'tv', label: 'TV', icon: Tv },
  { id: 'ac', label: 'Air conditioning', icon: Snowflake },
  { id: 'laundry', label: 'Laundry', icon: WashingMachine },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'lock', label: 'Lock', icon: Lock },
  { id: 'coffee', label: 'Coffee / drinks', icon: Coffee },
  { id: 'workspace', label: 'Workspace', icon: Monitor },
  { id: 'dining', label: 'Dining', icon: Utensils },
  { id: 'living', label: 'Living area', icon: Sofa },
  { id: 'pool', label: 'Pool / water', icon: Droplets },
  { id: 'gym', label: 'Fitness', icon: Gauge },
  { id: 'keyless', label: 'Keyless entry', icon: Key },
  { id: 'quiet', label: 'Quiet / air', icon: Wind },
]

const SPACE_ICON_COMPONENTS: Record<string, LucideIcon> = Object.fromEntries(
  SPACE_ICON_OPTIONS.map((option) => [option.id, option.icon])
)

export function spaceIconOrDefault(icon: string | null | undefined): LucideIcon {
  if (icon && SPACE_ICON_COMPONENTS[icon]) return SPACE_ICON_COMPONENTS[icon]
  return Sparkles
}