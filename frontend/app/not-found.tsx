'use client'

import { ArrowLeft } from 'lucide-react'
import { ButtonLink, Logo } from '@/components/ui'
import { useT } from '@/lib/i18n/I18nProvider'

export default function NotFound() {
  const t = useT()
  return (
    <div className="mc-stack mc-gap-24" style={{ minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
      <Logo href="/dashboard/" />
      <div className="mc-stack mc-gap-8" style={{ maxWidth: 420, alignItems: 'center' }}>
        <h1 className="mc-display mc-mono">404</h1>
        <p className="mc-body-lg mc-muted">{t.shell.notFound.message}</p>
      </div>
      <ButtonLink href="/dashboard/" variant="primary" icon={<ArrowLeft size={16} />}>
        {t.shell.notFound.backHome}
      </ButtonLink>
    </div>
  )
}
