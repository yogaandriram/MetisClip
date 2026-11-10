import React from 'react'
import '../styles/fonts'
import '../styles/tokens.css'
import '../styles/base.css'
import '../styles/components.css'
import { ToastProvider } from '@/components/ui/ToastProvider'

export const metadata = {
  title: 'MetisClip',
  description: 'Agentic AI video clipping untuk kreator, berjalan lokal di komputer Anda.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {children}
        <ToastProvider />
      </body>
    </html>
  )
}
