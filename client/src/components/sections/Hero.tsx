import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Calendar, ChevronDown, Sparkles } from 'lucide-react'
import GlowBackground from '@/components/ui/GlowBackground'
import PropertyVisual from '@/components/visuals/PropertyVisual'
import { imageAssets } from '@/config/images'
import { useReducedMotion } from '@/hooks/useReducedMotion'

const EASE = [0.22, 1, 0.36, 1] as const

export default function Hero() {
  const reduced = useReducedMotion()

  const line = {
    hidden: { opacity: 0, y: 34 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: { delay: 0.25 + i * 0.13, duration: 0.8, ease: EASE },
    }),
  }

  const fade = (delay: number) => ({
    initial: reduced ? undefined : { opacity: 0, y: 22 },
    animate: { opacity: 1, y: 0 },
    transition: { delay, duration: 0.7, ease: EASE },
  })

  return (
    <section id="home" className="relative flex min-h-svh items-center overflow-hidden">
      <GlowBackground className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-surface to-transparent" />

      <div className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-24 pt-32 sm:px-8 lg:pb-16 lg:pt-36">
        <div className="grid items-center gap-14 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
          {/* Copy */}
          <div>
            <motion.div {...fade(0.15)} className="mb-8 inline-flex items-center gap-2.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-purple opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-purple-bright" />
              </span>
              <span className="text-[11px] font-medium uppercase tracking-[0.34em] text-text-secondary">
                Luxury Penthouse Stays
              </span>
            </motion.div>

            <div className="overflow-hidden">
              <motion.h1
                custom={0}
                variants={reduced ? undefined : line}
                initial={reduced ? undefined : 'hidden'}
                animate={reduced ? undefined : 'visible'}
                className="font-display text-[clamp(3rem,8.5vw,6.5rem)] font-bold leading-[0.92] tracking-tight text-text-primary"
              >
                STAY IN
              </motion.h1>
              <motion.h1
                custom={1}
                variants={reduced ? undefined : line}
                initial={reduced ? undefined : 'hidden'}
                animate={reduced ? undefined : 'visible'}
                className="mt-2 font-display text-[clamp(3rem,8.5vw,6.5rem)] font-bold leading-[0.92] tracking-tight"
              >
                YOUR OWN
                <span className="text-gradient"> AURA.</span>
              </motion.h1>
            </div>

            <motion.p
              {...fade(0.7)}
              className="mt-8 max-w-lg text-base leading-relaxed text-text-secondary sm:text-lg"
            >
              Premium penthouse stays designed for those who appreciate the difference.
              Thoughtfully curated spaces where modern comfort meets quiet luxury —
              private, cinematic, unmistakably yours.
            </motion.p>

            <motion.div
              {...fade(0.85)}
              className="mt-10 flex flex-col gap-3.5 sm:flex-row sm:items-center"
            >
              <Link
                to="/properties"
                className="group inline-flex items-center justify-center gap-2.5 rounded-full bg-gradient-to-r from-purple via-magenta to-cyan bg-[length:200%_100%] bg-left px-8 py-4 text-sm font-semibold uppercase tracking-[0.14em] text-white shadow-glow-purple transition-all duration-300 hover:bg-right hover:shadow-glow-magenta"
              >
                Explore Homes
                <ArrowRight
                  size={16}
                  className="transition-transform duration-300 group-hover:translate-x-1"
                />
              </Link>
              <Link
                to="/book"
                className="inline-flex items-center justify-center gap-2.5 rounded-full border border-surface-300/80 px-8 py-4 text-sm font-semibold uppercase tracking-[0.14em] text-text-primary backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-purple/45 hover:shadow-glow-purple"
              >
                <Calendar size={16} className="text-cyan-bright" />
                Check Availability
              </Link>
            </motion.div>

            <motion.div
              {...fade(1.05)}
              className="mt-12 flex items-center gap-7 text-xs text-text-muted sm:gap-10"
            >
              <div className="flex items-center gap-2.5">
                <Sparkles size={14} className="text-purple-bright" />
                <span>3 premium homes</span>
              </div>
              <div className="h-3 w-px bg-surface-300/60" />
              <div className="flex items-center gap-2.5">
                <span className="text-base tracking-wide">
                  <span className="font-display text-lg font-semibold text-gradient">01—03</span>
                </span>
                <span>private penthouses</span>
              </div>
            </motion.div>
          </div>

          {/* Visual */}
          <motion.div
            initial={reduced ? undefined : { opacity: 0, scale: 0.96, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 1, ease: EASE }}
            className="relative mx-auto w-full max-w-sm sm:max-w-md lg:max-w-none"
          >
            <div className="pointer-events-none absolute -inset-8 rounded-[2rem] bg-gradient-to-br from-purple/[0.14] via-transparent to-cyan/[0.14] blur-2xl" />

            <div className="animated-gradient-border relative aspect-[4/5] overflow-hidden rounded-panel shadow-card">
              <PropertyVisual
                image={imageAssets.hero}
                accent="purple"
                variant="moon"
                label="Aura Cozy Penthouse — interior"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-surface/70 via-transparent to-transparent" />

              <div className="absolute left-5 top-5 rounded-full border border-white/10 bg-surface-50/80 px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-text-secondary backdrop-blur-md">
                Penthouse Residence
              </div>
            </div>

            <motion.div
              initial={reduced ? undefined : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.1, duration: 0.6, ease: EASE }}
              className="glass absolute -bottom-5 -left-3 flex items-center gap-3 rounded-2xl px-5 py-3.5 shadow-soft sm:-left-8"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-purple to-cyan text-xs font-bold text-white">
                3
              </span>
              <div>
                <p className="text-[13px] font-semibold text-text-primary">Official Homes</p>
                <p className="text-[11px] text-text-muted">Curated. Private. Yours.</p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>

      <motion.div
        initial={reduced ? undefined : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4, duration: 0.8 }}
        className="absolute bottom-7 left-1/2 hidden -translate-x-1/2 sm:block"
      >
        <Link
          to="/#properties"
          aria-label="Scroll to properties"
          className="text-text-muted transition-colors hover:text-text-primary"
        >
          <ChevronDown size={22} className="animate-bounce" />
        </Link>
      </motion.div>
    </section>
  )
}