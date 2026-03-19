import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Sidebar } from '@/src/components/layout/sidebar';
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
          <div className="flex h-screen">
            <Sidebar />
            <div className="flex flex-1 flex-col min-h-0">
              {children}
            </div>
          </div>
        </SessionProvider>
      </body>
    </html>
  );
}
