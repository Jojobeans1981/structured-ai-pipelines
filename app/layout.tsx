import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { LayoutShell } from '@/src/components/layout/layout-shell';
import { SessionProvider } from '@/src/components/providers/session-provider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'The One Forge',
  description: 'One Forge to build them all',
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
          {/* Forge lava background + watermarks */}
          <div className="forge-lava-bg" />
          <div className="forge-watermark-runes" />
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
