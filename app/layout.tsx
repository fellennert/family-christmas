import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ServiceWorkerRegistration } from '@/components/pwa';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Family Christmas', template: '%s · Family Christmas' },
  description: 'Our family’s private Christmas wish lists.',
  applicationName: 'Family Christmas',
  // iOS home-screen app settings (the manifest covers Android/desktop).
  appleWebApp: { capable: true, title: 'Christmas', statusBarStyle: 'default' },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  formatDetection: { telephone: false, email: false, address: false },
  // Private family site: keep it out of search engines.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#1f4d3a',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
