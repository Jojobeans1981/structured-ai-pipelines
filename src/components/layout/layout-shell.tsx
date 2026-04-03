'use client';

import { useState } from 'react';
import { Menu, Flame, Beaker } from 'lucide-react';
import { Sidebar } from './sidebar';

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <>
      {/* Mobile header bar */}
      <div className="fixed top-0 left-0 right-0 z-30 flex h-14 items-center border-b border-orange-900/30 px-4 forge-sidebar md:hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-400 hover:text-orange-400 hover:bg-orange-500/10 transition-colors"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2.5 ml-3">
          <div className="relative">
            <Flame className="h-5 w-5 text-orange-500 flame-flicker" />
            <div className="absolute inset-0 h-5 w-5 text-orange-500 blur-sm opacity-50">
              <Flame className="h-5 w-5" />
            </div>
          </div>
          <span className="forge-gradient-text text-base font-bold tracking-tight">The One Forge</span>
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      <Sidebar mobile open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Desktop sidebar */}
      <Sidebar />

      {/* Main content - add top padding on mobile for the header */}
      <div className="flex flex-1 flex-col min-h-0 overflow-y-auto pt-14 md:pt-0">
        <div className="border-b border-cyan-500/20 bg-cyan-500/5 px-4 py-2 text-xs text-cyan-100 md:px-6">
          <div className="mx-auto flex max-w-7xl items-center gap-2">
            <Beaker className="h-3.5 w-3.5 text-cyan-300" />
            <span className="font-medium">Beta mode active.</span>
            <span className="text-cyan-100/80">Login is intentionally turned off so testers can use the product quickly. We can switch auth back on when you are ready to launch.</span>
          </div>
        </div>
        {children}
      </div>
    </>
  );
}
