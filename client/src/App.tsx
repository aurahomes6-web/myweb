import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import PageTransition from '@/components/ui/PageTransition'
import ScrollManager from '@/components/ui/ScrollManager'
import HomePage from '@/pages/HomePage'
import PropertiesPage from '@/pages/PropertiesPage'
import PropertyDetailPage from '@/pages/PropertyDetailPage'
import BookingPage from '@/pages/BookingPage'
import NotFoundPage from '@/pages/NotFoundPage'

function AppShell() {
  const location = useLocation()

  return (
    <>
      <a
        href="#main-content"
        className="sr-only z-[200] rounded-full bg-purple px-5 py-2.5 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <Navbar />
      <AnimatePresence mode="wait">
        <PageTransition key={location.pathname}>
          <Routes location={location}>
            <Route path="/" element={<HomePage />} />
            <Route path="/properties" element={<PropertiesPage />} />
            <Route path="/properties/:slug" element={<PropertyDetailPage />} />
            <Route path="/book" element={<BookingPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </PageTransition>
      </AnimatePresence>
      <Footer />
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollManager />
      <div className="min-h-screen bg-surface">
        <AppShell />
      </div>
    </BrowserRouter>
  )
}