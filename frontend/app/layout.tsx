import React from 'react'
import '../styles/fonts'
import '../styles/globals.css'
import { Toaster } from 'react-hot-toast'

export const metadata = {
  title: 'MetisClip',
  description: 'Agentic AI video clipping untuk kreator — berjalan lokal di komputer Anda.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#0d0d18',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-glass)',
              fontSize: '14px',
            },
          }}
        />
      </body>
    </html>
  )
}
