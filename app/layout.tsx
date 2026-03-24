import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { LayoutShell } from '@/src/components/layout/layout-shell';
import { SessionProvider } from '@/src/components/providers/session-provider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Gauntlet Forge',
  description: 'Forge your code in structured fire',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <SessionProvider>
          {/* Forge lava background */}
          <div className="forge-lava-bg" />
          <div className="forge-ember" />
          <div className="forge-ember" />
          <div className="forge-ember" />
          <div className="forge-ember" />
          <div className="forge-ember" />
          <div className="forge-ember" />
          <div className="forge-ember" />
          <div className="forge-ember" />

          <div className="flex h-screen relative z-0">
            <LayoutShell>
              {children}
            </LayoutShell>
          </div>
        </SessionProvider>
      </body>
    </html>
  );
}
