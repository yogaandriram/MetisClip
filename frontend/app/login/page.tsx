'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { GlassCard } from '@/components/ui/GlassCard'
import { InputField } from '@/components/ui/InputField'
import { Button } from '@/components/ui/Button'
import { Mail, Lock, LogIn } from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClientComponentClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        toast.error(error.message)
      } else if (data.user) {
        toast.success('Berhasil masuk!')
        router.push('/discover') // Default dashboard page
        router.refresh()
      }
    } catch (err: any) {
      toast.error('Terjadi kesalahan yang tidak terduga.')
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
          <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>
            Selamat Datang
          </h1>
          <p style={{ color: 'var(--text-dim)', fontSize: '14px' }}>
            Masuk ke akun MetisClip Anda
          </p>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <InputField
            label="Email"
            type="email"
            placeholder="nama@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            icon={<Mail size={18} />}
            required
          />

          <InputField
            label="Kata Sandi"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            icon={<Lock size={18} />}
            required
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-10px' }}>
            <Link href="/forgot-password" style={{ 
              fontSize: '13px', 
              color: 'var(--primary)', 
              textDecoration: 'none',
              fontWeight: 600
            }}>
              Lupa sandi?
            </Link>
          </div>

          <Button 
            type="submit" 
            variant="primary" 
            loading={loading}
            icon={<LogIn size={18} />}
            style={{ width: '100%', marginTop: '10px' }}
          >
            Masuk
          </Button>
        </form>

        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
          Belum punya akun?{' '}
          <Link href="/register" style={{ color: 'var(--text-primary)', fontWeight: 600, textDecoration: 'none' }}>
            Daftar sekarang
          </Link>
        </div>
      </GlassCard>
    </div>
  )
}
