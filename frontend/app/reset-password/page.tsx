'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { GlassCard } from '@/components/ui/GlassCard'
import { InputField } from '@/components/ui/InputField'
import { Button } from '@/components/ui/Button'
import { Lock, Save } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ResetPasswordPage() {
  const router = useRouter()
  const supabase = createClientComponentClient()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  // Wait for the auth state to be established after clicking the email link
  useEffect(() => {
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        // We are good to go, user is ready to set a new password
      }
    })
  }, [])

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password !== confirmPassword) {
      toast.error('Kata sandi tidak cocok. Silakan periksa kembali.')
      return
    }

    if (password.length < 6) {
      toast.error('Kata sandi minimal 6 karakter.')
      return
    }

    setLoading(true)

    try {
      const { error } = await supabase.auth.updateUser({ password })

      if (error) {
        toast.error(error.message)
      } else {
        toast.success('Kata sandi berhasil diperbarui!')
        router.push('/login')
      }
    } catch (err: any) {
      toast.error('Terjadi kesalahan saat menyimpan kata sandi baru.')
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
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>
            Kata Sandi Baru
          </h1>
          <p style={{ color: 'var(--text-dim)', fontSize: '14px', lineHeight: 1.5 }}>
            Silakan masukkan kata sandi baru untuk akun Anda.
          </p>
        </div>

        <form onSubmit={handleUpdatePassword} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <InputField
            label="Kata Sandi Baru"
            type="password"
            placeholder="Minimal 6 karakter"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            icon={<Lock size={18} />}
            required
          />

          <InputField
            label="Konfirmasi Kata Sandi"
            type="password"
            placeholder="Ulangi kata sandi baru"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            icon={<Lock size={18} />}
            required
          />

          <Button 
            type="submit" 
            variant="primary" 
            loading={loading}
            icon={<Save size={18} />}
            style={{ width: '100%', marginTop: '10px' }}
          >
            Simpan Kata Sandi
          </Button>
        </form>
      </GlassCard>
    </div>
  )
}
