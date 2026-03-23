'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useSession, signIn, signOut } from 'next-auth/react';
import { LayoutDashboard, BarChart3, Settings, LogIn, LogOut, Flame, Hammer } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { Button } from '@/src/components/ui/button';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Forge', href: '/forge', icon: Hammer },
  { label: 'Metrics', href: '/metrics', icon: BarChart3 },
  { label: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();

  return (
    <aside className="flex h-screen w-64 flex-col forge-sidebar">
      {/* Logo area */}
      <div className="flex h-14 items-center border-b border-orange-900/30 px-6">
        <Link href="/" className="flex items-center gap-2.5 font-bold">
          <div className="relative">
            <Flame className="h-6 w-6 text-orange-500 flame-flicker" />
            <div className="absolute inset-0 h-6 w-6 text-orange-500 blur-sm opacity-50">
              <Flame className="h-6 w-6" />
            </div>
          </div>
          <span className="forge-gradient-text text-lg tracking-tight">Gauntlet Forge</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-orange-500/15 text-orange-400 border border-orange-500/20 shadow-sm shadow-orange-500/10'
                  : 'text-zinc-400 hover:bg-orange-500/5 hover:text-orange-300 border border-transparent'
              )}
            >
              <item.icon className={cn('h-4 w-4', isActive && 'text-orange-400')} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Decorative ember line */}
      <div className="mx-4 h-px bg-gradient-to-r from-transparent via-orange-500/30 to-transparent" />

      {/* User section */}
      <div className="p-4">
        {status === 'loading' && (
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="h-8 w-8 animate-pulse rounded-full bg-orange-500/10" />
            <div className="h-4 w-24 animate-pulse rounded bg-orange-500/10" />
          </div>
        )}
        {status === 'authenticated' && session.user && (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-orange-500/5 border border-orange-500/10 px-3 py-2">
            <div className="flex items-center gap-3 min-w-0">
              {session.user.image ? (
                <Image
                  src={session.user.image}
                  alt={session.user.name ?? 'User avatar'}
                  width={32}
                  height={32}
                  className="rounded-full ring-2 ring-orange-500/30"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500/20 text-orange-400 text-xs font-bold ring-2 ring-orange-500/30">
                  {session.user.name?.charAt(0)?.toUpperCase() ?? '?'}
                </div>
              )}
              <span className="truncate text-sm font-medium text-zinc-300">
                {session.user.name ?? session.user.email}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => signOut()}
              title="Sign out"
              className="text-zinc-500 hover:text-orange-400 hover:bg-orange-500/10"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        )}
        {status === 'unauthenticated' && (
          <Button
            variant="outline"
            className="w-full justify-start gap-3 border-orange-500/20 text-orange-400 hover:bg-orange-500/10 hover:text-orange-300"
            onClick={() => signIn('gitlab')}
          >
            <LogIn className="h-4 w-4" />
            Sign In with GitLab
          </Button>
        )}
      </div>
    </aside>
  );
}
