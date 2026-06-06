import React from 'react'
import '../styles/globals.css'
import { Toaster } from 'react-hot-toast'

export const metadata = {
  title: 'MetisClip — Premium Agentic Video Clipping & Distribution',
  description: 'AI-powered pipeline that finds, clips, and schedules viral shorts automatically.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body suppressHydrationWarning>
        <main>{children}</main>
        <Toaster position="bottom-right" />
      </body>
    </html>
  )
}
