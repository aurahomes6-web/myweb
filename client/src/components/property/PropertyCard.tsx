import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Users, BedDouble, Bath, Maximize, ArrowRight, MapPin } from 'lucide-react'
import type { Property } from '@/types'
import { accentPalettes } from '@/config/accents'
import PropertyVisual from '@/components/visuals/PropertyVisual'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/cn'

interface PropertyCardProps {
  property: Property
  index: number
}

export default function PropertyCard({ property, index }: PropertyCardProps) {
  const reduced = useReducedMotion()
  const accent = accentPalettes[property.accent]

  const stats = [
    { icon: Users, value: `${property.capacity} guests` },
    { icon: BedDouble, value: `${property.bedrooms} bedroom` },
    { icon: Bath, value: `${property.bathrooms} bath` },
    { icon: Maximize, value: `${property.sqft} sqft` },
  ]

  return (
    <motion.article
      id={property.slug}
      initial={reduced ? undefined : { opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: index * 0.12, ease: [0.22, 1, 0.36, 1] }}
      viewport={{ once: true, margin: '-60px' }}
      className="group card-surface relative flex flex-col overflow-hidden rounded-card transition-transform duration-500 hover:-translate-y-2 hover:shadow-card-hover"
      style={{ transitionProperty: 'transform, box-shadow, border-color' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = `color-mix(in srgb, ${accent.main} 45%, transparent)`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = ''
      }}
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <div className="h-full w-full overflow-hidden">
          <PropertyVisual
            image={property.image}
            accent={property.accent}
            variant={property.visual}
            label={`${property.name} interior view`}
            className="scale-100 transition-transform duration-[900ms] ease-out group-hover:scale-[1.05]"
          />
        </div>
        
      </div>

      <div className="flex flex-1 flex-col p-6 lg:p-7">
        <h3 className="font-display text-xl font-semibold tracking-tight text-text-primary lg:text-[22px]">
          {property.name}
        </h3>
        <p className="mt-2.5 text-sm leading-relaxed text-text-secondary">
          {property.shortDescription}
        </p>

        <div
          className="my-5 h-px w-full"
          style={{
            background: `linear-gradient(90deg, transparent, ${accent.main}55, transparent)`,
          }}
        />

        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {stats.map(({ icon: Icon, value }) => (
            <div key={value} className="flex items-center gap-2 text-[13px] text-text-muted">
              <Icon size={15} style={{ color: accent.main }} strokeWidth={2} />
              <span>{value}</span>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-1.5">
          {property.amenities.slice(0, 4).map((amenity) => (
            <span
              key={amenity}
              className="rounded-full border border-surface-300/50 bg-surface-100/50 px-3 py-1 text-[11px] text-text-muted"
            >
              {amenity}
            </span>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">Nightly rate</p>
          <p className="font-display text-xl font-bold tracking-tight text-text-primary">
            {formatINR(property.pricePerNightPaise)}
            <span className="ml-1 text-xs font-medium text-text-muted">/ night</span>
          </p>
        </div>

        <div className="mt-7 flex flex-1 flex-col items-end gap-2.5">
          <Link
            to={`/properties/${property.slug}`}
            className={cn(
              'group/btn relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-full py-3.5',
              'text-sm font-semibold uppercase tracking-[0.14em] text-ink',
              'bg-gradient-to-r from-purple via-magenta to-cyan bg-[length:200%_100%] bg-left',
              'transition-all duration-500 hover:bg-right hover:shadow-glow-magenta'
            )}
          >
            View Details
            <ArrowRight size={15} className="transition-transform duration-300 group-hover/btn:translate-x-1" />
          </Link>
          <Link
            to={`/properties/${property.slug}#availability`}
            className={cn(
              'inline-flex w-full items-center justify-center gap-2 rounded-full border border-surface-300/70 py-3 text-[13px] font-semibold uppercase tracking-[0.12em] text-text-secondary',
              'transition-all duration-300 hover:border-purple/45 hover:text-text-primary hover:shadow-glow-purple'
            )}
          >
            <MapPin size={14} className="opacity-90" />
            Check Availability
          </Link>
        </div>
      </div>
    </motion.article>
  )
}