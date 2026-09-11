import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Menu, X, ArrowUpRight } from 'lucide-react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { cn } from '@/lib/cn'

const navLinks = [
  { label: 'Home', to: '/' },
  { label: 'Properties', to: '/properties' },
  { label: 'Availability', to: '/book' },
  { label: 'About', to: '/#about' },
]

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const reduced = useReducedMotion()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 32)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <>
      <motion.header
        initial={reduced ? undefined : { y: -72, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="fixed inset-x-0 top-0 z-50 px-4 pt-4 sm:px-6"
      >
        <nav
          className={cn(
            'mx-auto flex max-w-6xl items-center justify-between rounded-full px-5 py-3 sm:px-7',
            'border backdrop-blur-2xl transition-all duration-500',
            scrolled || open
              ? 'border-surface-300/45 bg-surface/70 shadow-soft'
              : 'border-white/[0.05] bg-surface/35'
          )}
        >
          <Link to="/" className="select-none" aria-label="AURA HOMES — home">
            <span className="font-display text-[15px] font-bold tracking-[0.3em] text-text-primary">
              AURA
            </span>
            <span className="ml-1.5 align-middle font-display text-[10px] font-medium tracking-[0.42em] text-text-muted">
              HOMES
            </span>
          </Link>

          <div className="hidden items-center gap-9 lg:flex">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="link-underline text-[13px] font-medium tracking-[0.08em] text-text-secondary uppercase hover:text-text-primary"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="hidden lg:block">
            <Link
              to="/book"
              className={cn(
                'group inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-xs font-semibold tracking-[0.14em] uppercase text-white',
                'bg-gradient-to-r from-purple via-magenta to-cyan bg-[length:200%_100%] bg-left shadow-glow-purple',
                'transition-all duration-300 hover:bg-right hover:shadow-glow-magenta'
              )}
            >
              Book Your Stay
              <ArrowUpRight
                size={14}
                className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              />
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            className="grid h-10 w-10 place-items-center rounded-full text-text-primary transition-colors hover:bg-surface-200/70 lg:hidden"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </nav>
      </motion.header>

      <AnimatePresence>
        {open && (
          <motion.div
            key="mobile-menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-40 flex flex-col bg-surface/90 backdrop-blur-2xl lg:hidden"
          >
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8">
              {navLinks.map((link, i) => (
                <motion.div
                  key={link.to}
                  initial={reduced ? undefined : { opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 + i * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Link
                    to={link.to}
                    onClick={() => setOpen(false)}
                    className="group flex w-full max-w-xs items-center justify-between border-b border-surface-300/30 py-5"
                  >
                    <span className="font-display text-3xl font-medium tracking-wide text-text-secondary transition-colors group-hover:text-text-primary">
                      {link.label}
                    </span>
                    <ArrowUpRight
                      size={20}
                      className="text-text-muted transition-colors group-hover:text-cyan-bright"
                    />
                  </Link>
                </motion.div>
              ))}

              <motion.div
                initial={reduced ? undefined : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.34, duration: 0.4 }}
                className="w-full max-w-xs"
              >
                <Link
                  to="/book"
                  onClick={() => setOpen(false)}
                  className="mt-8 block w-full rounded-full bg-gradient-to-r from-purple via-magenta to-cyan py-4 text-center text-sm font-semibold tracking-[0.14em] uppercase text-white shadow-glow-purple"
                >
                  Book Your Stay
                </Link>
              </motion.div>
            </div>

            <motion.p
              initial={reduced ? undefined : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.45 }}
              className="pb-10 text-center text-[11px] tracking-[0.28em] uppercase text-text-muted"
            >
              Premium stays, thoughtfully designed.
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}