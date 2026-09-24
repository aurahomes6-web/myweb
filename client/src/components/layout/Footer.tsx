import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useContact } from '@/services/contact'
import { mailtoHref, telHref } from '@/lib/contactFormat'

const navigate = [
  { label: 'Home', to: '/' },
  { label: 'Properties', to: '/properties' },
  { label: 'Availability', to: '/book' },
  { label: 'About', to: '/#about' },
]

const explore = [
  { label: 'The Penthouses', to: '/properties' },
  { label: 'Why AURA HOMES', to: '/#about' },
  { label: 'Guest Experience', to: '/book' },
]

export default function Footer() {
  const reduced = useReducedMotion()
  const { contact } = useContact()

  return (
    <footer className="relative border-t border-surface-300/40 bg-surface-50/60">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-magenta/50 to-transparent" />

      <div className="mx-auto max-w-7xl px-6 pb-10 pt-16 lg:px-8 lg:pt-20">
        <motion.div
          initial={reduced ? undefined : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          viewport={{ once: true, margin: '-60px' }}
          className="grid grid-cols-2 gap-10 md:grid-cols-4"
        >
          <div className="col-span-2 md:col-span-1">
            <img
              src="/logo.jpeg"
              alt="AURA HOMES"
              className="h-10 w-10 object-contain"
            />
            <p className="mt-4 max-w-[15rem] text-sm leading-relaxed text-text-muted">
              Premium stays, thoughtfully designed. Every space curated for comfort, style,
              and an experience that stays with you.
            </p>
          </div>

          <div>
            <h4 className="text-[11px] font-semibold tracking-[0.24em] uppercase text-text-secondary">
              Navigate
            </h4>
            <ul className="mt-5 space-y-3">
              {navigate.map((item) => (
                <li key={item.label}>
                  <Link
                    to={item.to}
                    className="link-underline text-sm text-text-muted hover:text-text-primary"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-[11px] font-semibold tracking-[0.24em] uppercase text-text-secondary">
              Explore
            </h4>
            <ul className="mt-5 space-y-3">
              {explore.map((item) => (
                <li key={item.label}>
                  <Link
                    to={item.to}
                    className="link-underline text-sm text-text-muted hover:text-text-primary"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="col-span-2 md:col-span-1">
            <h4 className="text-[11px] font-semibold tracking-[0.24em] uppercase text-text-secondary">
              Contact
            </h4>
            <ul className="mt-5 space-y-3 text-sm text-text-muted">
              <li>
                <a href={mailtoHref(contact.email)} className="link-underline hover:text-text-primary">
                  {contact.email}
                </a>
              </li>
              <li>
                <a href={telHref(contact.phone)} className="link-underline hover:text-text-primary">
                  {contact.phone}
                </a>
              </li>
              <li>{contact.description}</li>
            </ul>
          </div>
        </motion.div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-surface-300/30 pt-7 sm:flex-row">
          <p className="text-xs text-text-muted">
            &copy; {new Date().getFullYear()} AURA HOMES. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-xs text-text-muted">
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-purple to-cyan" />
              Premium stays.
            </span>
            <Link to="/" className="link-underline hover:text-text-primary">
              Back to top
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}