import { useProperties } from '@/services/properties'
import PropertyGrid from '@/components/property/PropertyGrid'
import SectionHeading from '@/components/ui/SectionHeading'

export default function PropertiesSection() {
  const { items } = useProperties()

  return (
    <section id="properties" className="relative py-24 lg:py-32">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-purple/40 to-transparent" />

      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <SectionHeading
          eyebrow="Our Homes"
          title={
            <>
              OUR <span className="text-gradient">HOMES</span>
            </>
          }
          description="Three spaces. One AURA."
        />

        <PropertyGrid items={items} />
      </div>
    </section>
  )
}