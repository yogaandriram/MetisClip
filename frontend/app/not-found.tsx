'use client'

import { ArrowLeft } from 'lucide-react'
import { ButtonLink, Logo } from '@/components/ui'

export default function NotFound() {
  return (
    <div className="mc-stack mc-gap-24" style={{ minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
      <Logo href="/dashboard/" />
      <div className="mc-stack mc-gap-8" style={{ maxWidth: 420, alignItems: 'center' }}>
        <h1 className="mc-display mc-mono">404</h1>
        <p className="mc-body-lg mc-muted">Halaman tidak ditemukan.</p>
      </div>
      <ButtonLink href="/dashboard/" variant="primary" icon={<ArrowLeft size={16} />}>
        Kembali ke Beranda
      </ButtonLink>
    </div>
  )
}
