import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Cursor Cloud Agents',
  description: 'Web interface for Cursor Cloud Agents - build, fix bugs, explore',
  manifest: '/manifest.json',
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
  // Theme color for Safari browser chrome - pure black to match the app
  themeColor: '#000000',
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
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased bg-black text-zinc-100`}
      >
        {children}
      </body>
    </html>
  );
}
