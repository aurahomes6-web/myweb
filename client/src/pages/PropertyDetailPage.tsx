import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Users, MapPin, Sparkles, Loader2, type LucideIcon } from 'lucide-react'
import { usePropertyBySlug } from '@/services/properties'
import { accentPalettes } from '@/config/accents'
import { spaceIconOrDefault } from '@/config/spaceIcons'
import { formatGuestCapacity } from '@/lib/space'
import ImageGallery from '@/components/gallery/ImageGallery'
import AvailabilityCard from '@/components/booking/AvailabilityCard'
import NotFoundContent from '@/components/ui/NotFoundContent'

interface SpaceSpec {
  key: string
  icon: LucideIcon
  label: string
  value: string
}

export default function PropertyDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const { property, isMissing } = usePropertyBySlug(slug)

  if (isMissing) {
    return <NotFoundContent />
  }

  if (!property) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 size={28} className="animate-spin text-text-muted" />
      </div>
    )
  }

  const accent = accentPalettes[property.accent]

  const specs: SpaceSpec[] = []
  specs.push({
    key: 'capacity',
    icon: Users,
    label: 'Capacity',
    value: formatGuestCapacity(property.minGuests, property.maxGuests),
  })
  for (const attribute of property.spaceAttributes) {
    specs.push({
      key: attribute.id,
      icon: spaceIconOrDefault(attribute.icon),
      label: attribute.label,
      value: attribute.value,
    })
  }

  return (
    <div className="mx-auto max-w-7xl px-5 pb-28 pt-28 sm:px-8 lg:pt-32">
      {/* Header */}
      <div className="mb-10 flex flex-col gap-6 lg:mb-12">
        <Link
          to="/properties"
          className="inline-flex w-fit items-center gap-2 text-sm text-text-muted transition-colors hover:text-text-primary"
        >
          <ArrowLeft size={15} />
          All properties
        </Link>

        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p
              className="mb-3 text-[11px] font-semibold uppercase tracking-[0.28em]"
              style={{ color: accent.bright }}
            >
              {property.shortLabel}
            </p>
            <h1 className="font-display text-4xl font-bold tracking-tight text-text-primary sm:text-5xl lg:text-6xl">
              {property.name}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-text-secondary sm:text-lg">
              {property.shortDescription}
            </p>
          </div>

          <div
            className="flex items-center gap-3 rounded-full border border-surface-300/50 bg-surface-100/60 px-5 py-3 text-[11px] font-medium uppercase tracking-[0.18em] text-text-muted"
          >
            <span className="h-2 w-2 rounded-full" style={{ background: accent.bright, boxShadow: `0 0 10px ${accent.main}` }} />
            {property.isActive === false ? 'Coming soon' : 'Ready for your dates'}
          </div>
        </div>
      </div>

      {/* Main layout */}
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-8">
        <div className="flex flex-col gap-16">
          <ImageGallery property={property} />

          {/* About this home */}
          <section id="about" className="max-w-2xl">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
              ABOUT THIS <span className="text-gradient">HOME</span>
            </h2>
            <p className="mt-5 text-base leading-relaxed text-text-secondary">
              {property.description}
            </p>

            {property.location ? (
              <div className="mt-7 flex items-start gap-3 rounded-2xl border border-surface-300/40 bg-surface-100/40 p-5">
                <MapPin size={18} className="mt-0.5 shrink-0" style={{ color: accent.main }} />
                <div>
                  <p className="text-sm font-semibold text-text-primary">{property.location}</p>
                  <p className="mt-1 text-sm text-text-muted">
                    Exact address is shared after booking is confirmed.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-7 flex items-start gap-3 rounded-2xl border border-surface-300/40 bg-surface-100/40 p-5">
                <MapPin size={18} className="mt-0.5 shrink-0 text-text-muted" />
                <div>
                  <p className="text-sm font-semibold text-text-primary">Location details coming soon</p>
                  <p className="mt-1 text-sm text-text-muted">
                    The neighbourhood, views and exact address will be added as they become available.
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* Amenities */}
          <section id="amenities">
            <h2 className="mb-7 font-display text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
              AMENITIES
            </h2>
            <ul className="flex flex-wrap gap-2.5">
              {property.amenities.map((amenity) => (
                <li
                  key={amenity}
                  className="flex items-center gap-2 rounded-full border border-surface-300/50 bg-surface-100/50 px-4 py-2 text-sm text-text-secondary"
                >
                  <Sparkles size={13} style={{ color: accent.main }} />
                  {amenity}
                </li>
              ))}
            </ul>
          </section>

          {/* The space */}
          {specs.length > 0 && (
            <section id="space">
              <h2 className="mb-7 font-display text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
                THE SPACE
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {specs.map(({ icon: Icon, label, value, key }) => (
                  <div
                    key={key}
                    className="card-surface flex flex-col items-start gap-2 rounded-card p-5"
                    style={{ borderTopColor: `color-mix(in srgb, ${accent.main} 55%, transparent)` }}
                  >
                    <Icon size={20} style={{ color: accent.bright }} strokeWidth={1.75} />
                    <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">
                      {label}
                    </p>
                    <p className="font-display text-lg font-semibold text-text-primary">{value}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <AvailabilityCard property={property} />
        </aside>
      </div>
    </div>
  )
}