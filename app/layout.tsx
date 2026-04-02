import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { LayoutShell } from '@/src/components/layout/layout-shell';
import { SessionProvider } from '@/src/components/providers/session-provider';
import { BuildBadge } from '@/src/components/layout/build-badge';

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
          <div className="forge-watermark-runes">
            <div className="forge-shimmer-band" />
            <div className="forge-spark" style={{ top: '15%', left: '12%', animationDelay: '0s' }} />
            <div className="forge-spark" style={{ top: '40%', left: '55%', animationDelay: '0.7s' }} />
            <div className="forge-spark" style={{ top: '70%', left: '30%', animationDelay: '1.4s' }} />
            <div className="forge-spark" style={{ top: '25%', left: '78%', animationDelay: '2.1s' }} />
            <div className="forge-spark" style={{ top: '60%', left: '88%', animationDelay: '0.3s' }} />
            <div className="forge-spark" style={{ top: '85%', left: '45%', animationDelay: '1.8s' }} />
            <div className="forge-spark" style={{ top: '10%', left: '92%', animationDelay: '1.1s' }} />
            <div className="forge-spark" style={{ top: '50%', left: '8%', animationDelay: '2.5s' }} />
          </div>
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
          <BuildBadge />
        </SessionProvider>
      </body>
    </html>
  );
}
