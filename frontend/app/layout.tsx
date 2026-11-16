import React from 'react'
import '../styles/fonts'
import '../styles/tokens.css'
import '../styles/base.css'
import '../styles/components.css'
import '../styles/campaign.css'
import '../styles/brief.css'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { I18nProvider } from '@/lib/i18n/I18nProvider'

export const metadata = {
  title: 'MetisClip',
  description: 'Agentic AI video clipping for creators, running locally on your PC.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <I18nProvider>
          {children}
          <ToastProvider />
        </I18nProvider>
      </body>
    </html>
  )
}
