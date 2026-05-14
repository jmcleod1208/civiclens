import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { Suspense, lazy } from 'react'

import { ThemeProvider } from './lib/theme-context'
import { AuthProvider } from './lib/auth-context'
import { Navbar } from './components/Navbar'

const Onboarding     = lazy(() => import('./pages/Onboarding'))
const Home           = lazy(() => import('./pages/Home'))
const DocumentDetail = lazy(() => import('./pages/DocumentDetail'))
const PoliticianDetail = lazy(() => import('./pages/PoliticianDetail'))
const Search         = lazy(() => import('./pages/Search'))
const SchoolBoards   = lazy(() => import('./pages/SchoolBoards'))
const Account        = lazy(() => import('./pages/Account'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})

function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25 }}
    >
      {children}
    </motion.div>
  )
}

function PageFallback() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="animate-pulse space-y-4">
        <div className="h-6 w-48 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-4 w-96 rounded bg-gray-100 dark:bg-gray-800" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-8">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="h-48 rounded-2xl bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      </div>
    </div>
  )
}

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={location.pathname}>
        <Route path="/onboarding" element={
          <PageTransition><Suspense fallback={<PageFallback />}><Onboarding /></Suspense></PageTransition>
        } />
        <Route path="/" element={
          <PageTransition><Suspense fallback={<PageFallback />}><Home /></Suspense></PageTransition>
        } />
        <Route path="/document/:id" element={
          <PageTransition><Suspense fallback={<PageFallback />}><DocumentDetail /></Suspense></PageTransition>
        } />
        <Route path="/politician/:id" element={
          <PageTransition><Suspense fallback={<PageFallback />}><PoliticianDetail /></Suspense></PageTransition>
        } />
        <Route path="/search" element={
          <PageTransition><Suspense fallback={<PageFallback />}><Search /></Suspense></PageTransition>
        } />
        <Route path="/school-boards" element={
          <PageTransition><Suspense fallback={<PageFallback />}><SchoolBoards /></Suspense></PageTransition>
        } />
        <Route path="/account" element={
          <PageTransition><Suspense fallback={<PageFallback />}><Account /></Suspense></PageTransition>
        } />
      </Routes>
    </AnimatePresence>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <div className="min-h-screen bg-[var(--color-surface)] dark:bg-[var(--color-surface-dark)] text-gray-900 dark:text-gray-100 transition-colors">
              <Navbar />
              <AnimatedRoutes />
            </div>
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
