import type { Metadata } from 'next';
import { Fraunces, Instrument_Sans, IBM_Plex_Mono } from 'next/font/google';
import 'leaflet/dist/leaflet.css';
import './globals.css';
import { SiteHeader } from '@/components/SiteHeader';

const serif = Fraunces({ subsets: ['latin'], weight: ['400', '500', '600', '700'], style: ['normal', 'italic'], display: 'swap', variable: '--font-serif' });
const sans = Instrument_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], display: 'swap', variable: '--font-sans' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], display: 'swap', variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Mul — spring monitoring for local government',
  description:
    'The spring-monitoring portal for a rural municipality: watch every source, investigate the ones that are failing, decide what to do.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <SiteHeader />
        <div className="pt-[54px]">{children}</div>
      </body>
    </html>
  );
}
