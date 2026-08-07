'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Globe,
  Shield,
  MailWarning,
  BarChart3,
  Settings,
  Users,
  Mail,
  ChevronLeft,
  ChevronRight,
  List,
  Send,
  ShieldCheck,
  ShieldAlert,
  ClipboardList,
  Bell,
  Key,
} from "lucide-react";
import { useState } from 'react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/domains', label: 'Domains', icon: Globe },
  { href: '/filters', label: 'Filter Rules', icon: Shield },
  { href: '/quarantine', label: 'Quarantine', icon: MailWarning },
  { href: '/queue', label: 'Mail Queue', icon: List },
  { href: '/relay', label: 'Outgoing Relay', icon: Send },
  { href: '/trusted-hosts', label: 'Trusted Hosts', icon: ShieldCheck },
  { href: '/gateway', label: 'Enterprise Gateway', icon: ShieldAlert },
  { href: '/access-lists', label: 'Whitelist & Blocklist', icon: ShieldCheck },
  { href: '/gateway/smtp-auth', label: 'SMTP Auth', icon: Key },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/email-history', label: 'Email History', icon: Mail },
  { href: '/audit', label: 'Audit Log', icon: ClipboardList },
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const adminItems = [
  { href: '/admin', label: 'Admin', icon: Users },
  { href: '/admin/tenants', label: 'Tenants', icon: Users },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen bg-sidebar border-r border-gray-200 transition-all duration-300 flex flex-col',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center flex-shrink-0">
            <Mail className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <div>
              <h1 className="text-lg font-bold text-gray-900">CMP</h1>
              <p className="text-[10px] text-gray-500 -mt-0.5">Cloud Mail Protocol</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary-50 text-primary-700 border border-primary-200'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className={cn('w-5 h-5 flex-shrink-0', isActive ? 'text-primary-600' : 'text-gray-400')} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}

        {/* Admin section */}
        <div className={cn('pt-4 mt-4 border-t border-gray-200')}>
          {!collapsed && (
            <p className="px-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Administration</p>
          )}
          {adminItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary-50 text-primary-700 border border-primary-200'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                )}
                title={collapsed ? item.label : undefined}
              >
                <item.icon className={cn('w-5 h-5 flex-shrink-0', isActive ? 'text-primary-600' : 'text-gray-400')} />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Bottom */}
      <div className="border-t border-gray-200 p-3">
        {!collapsed && (
          <div className="px-3 mb-2">
            <p className="text-xs text-gray-400">Powered by</p>
            <p className="text-sm font-medium text-gray-600">CMP Gateway</p>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center py-2 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
}
