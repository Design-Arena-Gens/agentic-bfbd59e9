import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sound Meter',
  description: 'Real-time microphone sound level meter in the browser'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
