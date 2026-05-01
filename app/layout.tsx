import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'YOTERS — Skip the Wait',
  description: 'Real-time restaurant queue visibility. Join virtually, pre-order food, get seated faster.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
