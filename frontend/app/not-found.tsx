import Link from 'next/link'

export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-deep)', padding: '20px' }}>
      <div style={{ textAlign: 'center', maxWidth: '420px' }}>
        <h1 style={{ fontSize: '48px', fontWeight: 800, marginBottom: '8px' }}>404</h1>
        <p style={{ color: 'var(--text-dim)', marginBottom: '24px' }}>Halaman tidak ditemukan.</p>
        <Link href="/dashboard/" className="btn-primary" style={{ textDecoration: 'none', display: 'inline-flex' }}>
          Kembali ke Beranda
        </Link>
      </div>
    </div>
  )
}
