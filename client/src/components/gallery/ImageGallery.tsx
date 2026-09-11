import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Expand, X } from 'lucide-react'
import type { Property } from '@/types'
import { accentPalettes } from '@/config/accents'
import PropertyVisual from '@/components/visuals/PropertyVisual'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { cn } from '@/lib/cn'

interface ImageGalleryProps {
  property: Property
}

export default function ImageGallery({ property }: ImageGalleryProps) {
  const reduced = useReducedMotion()
  const palette = accentPalettes[property.accent]

  const slides = useMemo(() => property.gallery, [property.gallery])
  const [active, setActive] = useState(0)
  const [lightbox, setLightbox] = useState(false)

  useEffect(() => {
    document.body.style.overflow = lightbox ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [lightbox])

  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(false)
      if (e.key === 'ArrowRight') setActive((i) => (i + 1) % slides.length)
      if (e.key === 'ArrowLeft') setActive((i) => (i - 1 + slides.length) % slides.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, slides.length])

  const slide = slides[active] ?? slides[0]

  const edgeButton =
    'absolute top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-surface/70 text-text-primary backdrop-blur-md transition-colors hover:border-white/25 hover:bg-surface-100'

  return (
    <section
      aria-label={`${property.name} photo gallery`}
      className="card-surface rounded-panel p-2.5 sm:p-3"
    >
      {/* Main stage */}
      <div
        className="animated-gradient-border relative aspect-[4/3] overflow-hidden rounded-[1.1rem] sm:aspect-[16/10]"
        style={{
          ['--aura-angle' as string]: '0deg',
          animationDuration: reduced ? '0.01ms' : undefined,
        }}
      >
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={active}
            initial={reduced ? undefined : { opacity: 0.25, scale: 1.01 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduced ? undefined : { opacity: 0.2 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0"
          >
            <PropertyVisual
              image={slide.image}
              accent={slide.accent}
              variant={slide.variant}
              label={slide.label}
              className="h-full w-full object-cover"
            />
          </motion.div>
        </AnimatePresence>

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-surface-50/70 via-transparent to-transparent" />

        {slides.length > 1 && (
          <>
            <button type="button" onClick={() => setLightbox(true)} aria-label="Expand gallery" className={cn(edgeButton, 'right-4 top-4 translate-y-0')}>
              <Expand size={17} />
            </button>
            <button type="button" onClick={() => setActive((i) => (i - 1 + slides.length) % slides.length)} aria-label="Previous image" className={cn(edgeButton, 'left-4')}>
              <ChevronLeft size={20} />
            </button>
            <button type="button" onClick={() => setActive((i) => (i + 1) % slides.length)} aria-label="Next image" className={cn(edgeButton, 'right-4')}>
              <ChevronRight size={20} />
            </button>
          </>
        )}

        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/10 bg-surface/70 px-3 py-1.5 backdrop-blur-md">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Show image ${i + 1}: ${s.label}`}
              aria-current={i === active}
              className="group/ind grid h-6 place-items-center rounded-full px-1"
            >
              <span
                className={cn(
                  'block h-1.5 rounded-full transition-all duration-300',
                  i === active ? 'w-5' : 'w-1.5 bg-text-muted/50 group-hover/ind:bg-text-muted'
                )}
                style={i === active ? { background: palette.bright, boxShadow: `0 0 8px ${palette.main}` } : undefined}
              />
            </button>
          ))}
        </div>

        <div className="absolute bottom-4 left-4 rounded-full border border-white/10 bg-surface/70 px-3 py-1 text-[11px] font-medium tracking-[0.14em] text-text-secondary backdrop-blur-md">
          {active + 1} / {slides.length}
        </div>
      </div>

      {/* Thumbnails */}
      {slides.length > 1 && (
        <div
          className="no-scrollbar mt-2.5 flex gap-2.5 overflow-x-auto p-0.5"
          role="tablist"
          aria-label="Thumbnails"
        >
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={s.label}
              onClick={() => setActive(i)}
              className={cn(
                'relative h-16 w-24 shrink-0 overflow-hidden rounded-xl transition-all duration-300',
                i === active ? 'ring-2 ring-offset-2 ring-offset-surface' : 'opacity-45 hover:opacity-80'
              )}
              style={i === active ? ({ ['--tw-ring-color' as string]: palette.main ?? undefined } as React.CSSProperties) : undefined}
            >
              <PropertyVisual
                image={s.image}
                accent={s.accent}
                variant={s.variant}
                label=""
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[120] flex flex-col bg-surface-50/95 backdrop-blur-xl"
            onClick={() => setLightbox(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Gallery enlarged view"
          >
            <div className="flex items-center justify-between px-5 py-4">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-text-muted">
                {slide.label}
              </p>
              <button
                type="button"
                onClick={() => setLightbox(false)}
                aria-label="Close gallery"
                className="grid h-10 w-10 place-items-center rounded-full border border-surface-300/50 text-text-primary transition-colors hover:border-white/30 hover:bg-surface-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="relative flex-1 px-5 pb-6" onClick={(e) => e.stopPropagation()}>
              <AnimatePresence initial={false} mode="wait">
                <motion.div
                  key={active}
                  initial={reduced ? undefined : { opacity: 0, scale: 0.985 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reduced ? undefined : { opacity: 0 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className="mx-auto h-full max-h-full w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 shadow-card"
                >
                  <PropertyVisual
                    image={slide.image}
                    accent={slide.accent}
                    variant={slide.variant}
                    label={slide.label}
                    className="h-full w-full object-contain"
                  />
                </motion.div>
              </AnimatePresence>

              {slides.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setActive((i) => (i - 1 + slides.length) % slides.length)}
                    aria-label="Previous image"
                    className="absolute left-3 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-surface/70 text-text-primary backdrop-blur-md transition-colors hover:bg-surface-100 sm:left-6"
                  >
                    <ChevronLeft size={22} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActive((i) => (i + 1) % slides.length)}
                    aria-label="Next image"
                    className="absolute right-3 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-surface/70 text-text-primary backdrop-blur-md transition-colors hover:bg-surface-100 sm:right-6"
                  >
                    <ChevronRight size={22} />
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}