import AdminDashboard from '@/components/admin/AdminDashboard'

/**
 * Admin section — deliberately rendered OUTSIDE the public AppShell so the
 * site navbar, footer and page transitions never appear here. It is only
 * reachable by typing /admin directly; no public link points here.
 */
export default function AdminPage() {
  return <AdminDashboard />
}