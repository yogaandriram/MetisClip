'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { GlassCard } from '@/components/ui/GlassCard'
import { InputField } from '@/components/ui/InputField'
import { Button } from '@/components/ui/Button'
import { Mail, ArrowLeft, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const supabase = createClientComponentClient()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [isSent, setIsSent] = useState(false)

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (error) {
        toast.error(error.message)
      } else {
        setIsSent(true)
        toast.success('Tautan pemulihan telah dikirim!')
      }
    } catch (err: any) {
      toast.error('Terjadi kesalahan saat memproses permintaan Anda.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      background: 'var(--bg-deep)'
    }}>
      <GlassCard glow style={{ width: '100%', maxWidth: '420px', padding: '40px 30px' }}>
        <button 
          onClick={() => router.back()}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            marginBottom: '24px',
            padding: 0
          }}
        >
          <ArrowLeft size={16} /> Kembali ke Login
        </button>

        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>
            Pulihkan Kata Sandi
          </h1>
          <p style={{ color: 'var(--text-dim)', fontSize: '14px', lineHeight: 1.5 }}>
            Masukkan email yang terdaftar. Kami akan mengirimkan tautan untuk mengatur ulang kata sandi Anda.
          </p>
        </div>

        {isSent ? (
          <div style={{ 
            background: 'rgba(7, 202, 107, 0.1)', 
            border: '1px solid var(--accent)', 
            padding: '20px', 
            borderRadius: '12px',
            textAlign: 'center'
          }}>
            <p style={{ color: 'var(--accent)', fontSize: '14px', fontWeight: 500, marginBottom: '16px' }}>
              Silakan periksa kotak masuk email Anda (termasuk folder spam) untuk tautan pemulihan.
            </p>
            <Button variant="secondary" onClick={() => router.push('/login')} style={{ width: '100%' }}>
              Kembali ke Login
            </Button>
          </div>
        ) : (
          <form onSubmit={handleReset} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <InputField
              label="Alamat Email"
              type="email"
              placeholder="nama@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              icon={<Mail size={18} />}
              required
            />

            <Button 
              type="submit" 
              variant="primary" 
              loading={loading}
              icon={<Send size={18} />}
              style={{ width: '100%', marginTop: '10px' }}
            >
              Kirim Tautan Reset
            </Button>
          </form>
        )}
      </GlassCard>
    </div>
  )
}
