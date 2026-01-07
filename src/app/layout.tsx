import type { Metadata, Viewport } from 'next';
import { Analytics } from '@vercel/analytics/next';
import { Toaster } from 'sonner';
import { SessionProvider } from '@/components/SessionProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cursor Cloud Agents',
  description: 'Web interface for Cursor Cloud Agents - build, fix bugs, explore',
  manifest: '/manifest.json',
  // Open Graph metadata for Facebook, LinkedIn, iMessage, Slack, Discord, etc.
  openGraph: {
    title: 'Cursor Cloud Agents',
    description: 'Web interface for Cursor Cloud Agents - build, fix bugs, explore',
    siteName: 'Cursor',
    locale: 'en_US',
    type: 'website',
  },
  // Twitter card metadata
  twitter: {
    card: 'summary_large_image',
    title: 'Cursor Cloud Agents',
    description: 'Web interface for Cursor Cloud Agents - build, fix bugs, explore',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Cursor',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    // Apple touch icon for home screen (iOS requires PNG)
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Theme color for Safari browser chrome - matches dark theme bg
  themeColor: '#14120B',
  // Tell the browser this is a dark-mode site
  colorScheme: 'dark',
  // Extend viewport into notch/home indicator areas on iOS
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className="font-sans antialiased"
        style={{
          background: 'var(--color-theme-bg)',
          color: 'var(--color-theme-fg)',
        }}
      >
        <SessionProvider>
          {children}
          <Toaster
            theme="dark"
            position="top-center"
            toastOptions={{
              style: {
                background: 'var(--color-theme-bg-card)',
                border: '1px solid var(--color-theme-border-primary)',
                color: 'var(--color-theme-fg)',
              },
            }}
          />
          <Analytics />
        </SessionProvider>
      </body>
    </html>
  );
}
