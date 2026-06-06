'use client'

import React from 'react'
import { Sparkles, Video, Play, Calendar, Wand2, ArrowRight } from 'lucide-react'
import { GlassCard } from '../components/ui/GlassCard'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'

export default function Home() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header / Navbar */}
      <header style={{
        padding: '24px 40px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid var(--border-glass)',
        background: 'rgba(5, 5, 8, 0.5)',
        backdropFilter: 'blur(10px)',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            background: 'linear-gradient(135deg, var(--primary), var(--accent))',
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 20px var(--primary-glow)'
          }}>
            <Video size={20} color="#fff" />
          </div>
          <span style={{
            fontFamily: 'var(--font-display)',
            fontSize: '22px',
            fontWeight: 800,
            background: 'linear-gradient(90deg, #fff, #a78bfa)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>MetisClip</span>
        </div>
        
        <nav style={{ display: 'flex', gap: '30px', alignItems: 'center' }}>
          <a href="#features" style={{ color: 'var(--text-dim)', textDecoration: 'none', fontSize: '15px', transition: 'var(--transition-fast)' }}>Fitur</a>
          <a href="#how-it-works" style={{ color: 'var(--text-dim)', textDecoration: 'none', fontSize: '15px', transition: 'var(--transition-fast)' }}>Cara Kerja</a>
          <Button variant="secondary" size="sm" onClick={() => window.location.href = '/login'}>Masuk</Button>
          <Button variant="primary" size="sm" onClick={() => window.location.href = '/register'}>Mulai Gratis</Button>
        </nav>
      </header>

      {/* Hero Section */}
      <section style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '100px 20px 80px',
        textAlign: 'center',
        maxWidth: '1200px',
        margin: '0 auto',
        position: 'relative'
      }}>
        <Badge variant="primary" glow={true} icon={<Sparkles size={14} style={{ marginRight: '4px' }} />} style={{ marginBottom: '24px' }}>
          Agentic AI Clipping Platform
        </Badge>
        
        <h1 style={{
          fontSize: '64px',
          fontWeight: 900,
          lineHeight: 1.1,
          marginBottom: '24px',
          maxWidth: '900px',
          background: 'linear-gradient(to right, #FFFFFF, #C084FC, #06D6A0)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}>
          Ubah Video Panjang Menjadi Ratusan Konten Viral Otomatis
        </h1>
        
        <p style={{
          fontSize: '20px',
          color: 'var(--text-dim)',
          maxWidth: '650px',
          marginBottom: '40px',
          lineHeight: 1.6
        }}>
          Temukan konten potensial, potong otomatis dengan kecerdasan AI, buat subtitle dinamis, dan jadwalkan postingan YouTube Shorts di jam paling ramai.
        </p>

        <div style={{ display: 'flex', gap: '20px' }}>
          <Button 
            variant="primary" 
            size="lg" 
            onClick={() => window.location.href = '/register'}
            icon={<ArrowRight size={18} style={{ marginLeft: '8px' }} />}
          >
            Mulai Auto-Clip Sekarang
          </Button>
          <Button 
            variant="secondary" 
            size="lg" 
            onClick={() => window.location.href = '#how-it-works'}
          >
            Lihat Demo
          </Button>
        </div>

        {/* Decorative blur background */}
        <div style={{
          position: 'absolute',
          top: '30%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '500px',
          height: '500px',
          background: 'radial-gradient(circle, rgba(124,58,237,0.15) 0%, rgba(6,214,160,0.05) 50%, transparent 100%)',
          zIndex: -1,
          filter: 'blur(50px)'
        }}></div>
      </section>

      {/* Feature Section */}
      <section id="features" style={{
        padding: '100px 40px',
        background: 'rgba(10, 10, 15, 0.3)',
        borderTop: '1px solid var(--border-glass)'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: '36px', marginBottom: '60px' }}>
            Alur Otomatisasi AI Berbasis Agent
          </h2>
          
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '30px'
          }}>
            <GlassCard glow={true} padding="30px">
              <div style={{ color: 'var(--primary)', marginBottom: '20px' }}>
                <Sparkles size={32} />
              </div>
              <h3 style={{ fontSize: '20px', marginBottom: '12px' }}>1. AI Video Discovery</h3>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Mencari video di YouTube berdasarkan kata kunci target, otomatis menyaring podcast panjang berkualitas tinggi.
              </p>
            </GlassCard>

            <GlassCard glow={true} padding="30px">
              <div style={{ color: 'var(--accent)', marginBottom: '20px' }}>
                <Wand2 size={32} />
              </div>
              <h3 style={{ fontSize: '20px', marginBottom: '12px' }}>2. Viral Scene Analysis</h3>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Menganalisis transkrip dengan Llama 3.3 untuk memindai hook terbaik dan scene kontroversial berpeluang viral tinggi.
              </p>
            </GlassCard>

            <GlassCard glow={true} padding="30px">
              <div style={{ color: 'var(--primary)', marginBottom: '20px' }}>
                <Play size={32} />
              </div>
              <h3 style={{ fontSize: '20px', marginBottom: '12px' }}>3. Vertical Auto-Crop</h3>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Pemotongan frame otomatis berorientasi 9:16 (vertical mobile aspect ratio) lengkap dengan centering speaker.
              </p>
            </GlassCard>

            <GlassCard glow={true} padding="30px">
              <div style={{ color: 'var(--accent)', marginBottom: '20px' }}>
                <Calendar size={32} />
              </div>
              <h3 style={{ fontSize: '20px', marginBottom: '12px' }}>4. Post Scheduler</h3>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Menjadwalkan waktu publish secara otomatis berdasarkan data jam ramai penonton dari topik konten video yang diclip.
              </p>
            </GlassCard>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        padding: '40px',
        textAlign: 'center',
        borderTop: '1px solid var(--border-glass)',
        color: 'var(--text-muted)',
        fontSize: '14px'
      }}>
        <p>&copy; 2026 MetisClip. Dibuat dengan cinta menggunakan Next.js & Agentic AI.</p>
      </footer>
    </div>
  )
}
