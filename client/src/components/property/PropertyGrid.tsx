import type { Property } from '@/types'
import PropertyCard from '@/components/property/PropertyCard'

interface PropertyGridProps {
  items: Property[]
}

export default function PropertyGrid({ items }: PropertyGridProps) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-7 md:grid-cols-2 lg:grid-cols-3 lg:gap-8">
      {items.map((property, index) => (
        <PropertyCard key={property.id} property={property} index={index} />
      ))}
      {items.length === 0 && (
        <div
          className="card-surface col-span-full rounded-card p-12 text-center text-text-muted"
          role="status"
        >
          <p className="font-display text-lg text-text-primary">No homes available yet.</p>
          <p className="mt-2 text-sm">New stays will appear here as they are added.</p>
        </div>
      )}
    </div>
  )
}