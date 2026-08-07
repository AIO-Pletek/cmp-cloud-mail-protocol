import { Bell, ChevronRight, LogOut, Settings, User, ArrowLeft, Home } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/domains': 'Domains',
  '/filters': 'Filter Rules',
  '/quarantine': 'Quarantine',
  '/queue': 'Mail Queue',
  '/relay': 'Outgoing Relay',
  '/trusted-hosts': 'Trusted Hosts',
  '/gateway': 'Enterprise Gateway',
  '/gateway/smtp-auth': 'SMTP Auth',
  '/access-lists': 'Whitelist & Blocklist',
  '/reports': 'Reports',
  '/email-history': 'Email History',
  '/settings': 'Settings',
  '/settings/branding': 'Branding',
  '/admin': 'Admin Dashboard',
  '/admin/tenants': 'Tenant Management',
};

export function Header() {
  const { user, logout, isImpersonating, impersonatedBy, returnToAdmin } = useAuth();
  const pathname = usePathname();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const title = pageTitles[pathname] || pathname.split('/').filter(Boolean).pop()?.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || 'Dashboard';
  const segments = pathname.split('/').filter(Boolean);
  const isSubPage = segments.length > 1 || (segments.length === 1 && segments[0] !== 'dashboard');
  const parentPath = segments.length > 1 ? '/' + segments.slice(0, -1).join('/') : '/dashboard';

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-16 border-b border-gray-200 bg-white flex items-center justify-between px-6 sticky top-0 z-30">
      {isImpersonating && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-yellow-400 via-orange-400 to-red-400"></div>
      )}
      {/* Left: Back button + Breadcrumb */}
      <div className="flex items-center gap-3">
        {/* Back button - visible on sub-pages */}
        {pathname !== '/dashboard' && (
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
          >
            <Home className="w-4 h-4" />
            <span className="hidden sm:inline">Home</span>
          </Link>
        )}
        <div>
          <nav className="flex items-center space-x-1 text-sm text-gray-500">
            <Link href="/dashboard" className="hover:text-gray-700 font-medium">Home</Link>
            {segments.map((segment, i) => (
              <span key={i} className="flex items-center space-x-1">
                <ChevronRight className="w-3.5 h-3.5" />
                {i === segments.length - 1 ? (
                  <span className="text-gray-900 font-medium">{segment.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}</span>
                ) : (
                  <Link href={'/' + segments.slice(0, i + 1).join('/')} className="hover:text-gray-700">
                    {segment.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                  </Link>
                )}
              </span>
            ))}
          </nav>
          <h1 className="text-xl font-semibold text-gray-900 mt-0.5">{title}</h1>
        </div>
      </div>

      {/* Right: Back to Admin + Notifications + User */}
      <div className="flex items-center gap-4">
        {isImpersonating && (
          <button onClick={returnToAdmin} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-yellow-500 hover:bg-yellow-600 rounded-lg transition-colors shadow-sm">
            <ArrowLeft className="w-4 h-4" /> Back to Admin
          </button>
        )}
        <button className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <Bell className="w-5 h-5 text-gray-500" />
        </button>

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
              <span className="text-sm font-semibold text-primary-700">
                {user?.name?.charAt(0)?.toUpperCase() || 'U'}
              </span>
            </div>
            <div className="text-left hidden md:block">
              <p className="text-sm font-medium text-gray-900">{user?.name || 'User'}</p>
              <p className="text-xs text-gray-500">{user?.email || ''}</p>
            </div>
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
              <div className="px-4 py-2 border-b border-gray-100">
                <p className="text-sm font-medium text-gray-900">{user?.name}</p>
                <p className="text-xs text-gray-500">{user?.email}</p>
              </div>
              <Link href="/settings" className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => setDropdownOpen(false)}>
                <User className="w-4 h-4" /> Profile
              </Link>
              <Link href="/settings" className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => setDropdownOpen(false)}>
                <Settings className="w-4 h-4" /> Settings
              </Link>
              <hr className="my-1 border-gray-100" />
              <button onClick={() => { setDropdownOpen(false); logout(); }} className="flex items-center gap-2 px-4 py-2 text-sm text-danger-600 hover:bg-red-50 w-full">
                <LogOut className="w-4 h-4" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}