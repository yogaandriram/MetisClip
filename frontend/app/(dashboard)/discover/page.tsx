'use client'

import React, { useState } from 'react'
import { Sparkles, Search, CheckCircle, Loader2, Link as LinkIcon, Video, AlertCircle, RefreshCw } from 'lucide-react'
import { GlassCard } from '../../../components/ui/GlassCard'
import { Button } from '../../../components/ui/Button'
import { InputField } from '../../../components/ui/InputField'
import { SelectField } from '../../../components/ui/SelectField'
import { Spinner } from '../../../components/ui/Spinner'
import { ProgressBar } from '../../../components/ui/ProgressBar'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export default function Discover() {
  const supabase = createClientComponentClient()
  const [inputType, setInputType] = useState<'keyword' | 'url'>('keyword')
  const [keyword, setKeyword] = useState('AI')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [videoType, setVideoType] = useState('podcast')
  const [duration, setDuration] = useState('45-60')
  const [maxClips, setMaxClips] = useState<number>(3)
  
  const [isRunning, setIsRunning] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [progress, setProgress] = useState(0)
  const [totalScenes, setTotalScenes] = useState(0)
  const [processedScenes, setProcessedScenes] = useState(0)
  const [errorState, setErrorState] = useState<string | null>(null)

  const steps = [
    { label: 'Discovery Agent: Mencari video terbaik di YouTube...', duration: 3000 },
    { label: 'Analyzer Agent: Menganalisis transkrip viral via Groq...', duration: 4000 },
    { label: totalScenes > 0 ? `Processor Agent: Memotong klip (${processedScenes}/${totalScenes})...` : 'Processor Agent: Memotong klip & menghasilkan subtitle...', duration: 8000 },
    { label: 'Scheduler Agent: Menjadwalkan post otomatis...', duration: 2000 }
  ]

  const resetState = () => {
    setIsRunning(false)
    setErrorState(null)
    setCurrentStep(0)
    setProgress(0)
    setTotalScenes(0)
    setProcessedScenes(0)
  }

  const handleStartPipeline = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorState(null)

    if (inputType === 'keyword' && !keyword) return
    if (inputType === 'url') {
      if (!youtubeUrl) return
      // Basic YouTube URL Validation
      if (!youtubeUrl.includes('youtube.com') && !youtubeUrl.includes('youtu.be')) {
        setErrorState("Format URL tidak valid. Harap masukkan link YouTube yang benar.")
        setIsRunning(true) // To show the error UI state
        return
      }
    }
    
    setIsRunning(true)
    setCurrentStep(0)
    setProgress(0)

    try {
      // Security: Enforce real session authentication
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.access_token) {
        setErrorState("Akses Ditolak: Sesi Anda telah berakhir. Harap login kembali untuk menggunakan AI Pipeline.")
        return
      }

      const token = session.access_token

      // Use Environment Variable with fallback for API URL
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8002'

      const res = await fetch(`${API_BASE_URL}/api/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          keywords: inputType === 'keyword' ? [keyword] : [],
          youtube_url: inputType === 'url' ? youtubeUrl : null,
          video_types: [videoType],
          clip_duration: duration,
          max_clips: maxClips
        })
      })

      if (!res.ok) {
        throw new Error('Gagal terhubung dengan server AI. Pastikan backend aktif.')
      }
      
      const data = await res.json()
      const jobId = data.job?.id || data.job_id
      
      // Simulate initial progress for Discovery and Analyzer steps (0 to 45%)
      let initialSimulatedProgress = 10
      const initialInterval = setInterval(() => {
        if (errorState) {
          clearInterval(initialInterval)
          return
        }
        initialSimulatedProgress += 5
        if (initialSimulatedProgress >= 45) clearInterval(initialInterval)
        setProgress(prev => Math.max(prev, initialSimulatedProgress))
      }, 2000)

      // Poll real backend status via Supabase every 3 seconds
      const pollInterval = setInterval(async () => {
        if (errorState) {
          clearInterval(pollInterval)
          clearInterval(initialInterval)
          return
        }

        const { data: job, error } = await supabase
          .from('discovery_jobs')
          .select('status, total_scenes, processed_scenes')
          .eq('id', jobId)
          .single()
          
        if (job) {
          const total = job.total_scenes || 0
          const processed = job.processed_scenes || 0
          
          if (job.status === 'completed') {
            clearInterval(pollInterval)
            clearInterval(initialInterval)
            setCurrentStep(3)
            setProgress(100)
            setTimeout(() => {
              window.location.href = '/clips'
            }, 1000)
          } else if (job.status === 'failed') {
            clearInterval(pollInterval)
            clearInterval(initialInterval)
            setErrorState("Pipeline backend gagal memproses video. Harap coba video lain atau cek log server.")
          } else if (total > 0) {
            clearInterval(initialInterval)
            setCurrentStep(2)
            const processProgress = 50 + (processed / total) * 40
            setProgress(processProgress)
            setTotalScenes(total)
            setProcessedScenes(processed)
          } else {
            setCurrentStep(1)
          }
        } else if (error) {
          clearInterval(pollInterval)
          clearInterval(initialInterval)
          setErrorState("Koneksi terputus: Gagal membaca status pipeline dari database.")
        }
      }, 3000)
      
    } catch (error: any) {
      console.error(error)
      setErrorState(error.message || "Terjadi kesalahan internal sistem saat memulai pipeline.")
    }
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '40px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: '800', marginBottom: '8px' }}>Cari & Ekstrak Konten</h1>
        <p style={{ color: 'var(--text-muted)' }}>Mulai pencarian video youtube dan biarkan AI otomatis memotong klip terbaik untuk Anda.</p>
      </div>

      {!isRunning ? (
        <form onSubmit={handleStartPipeline}>
          <GlassCard glow={true} padding="40px">
            {/* Input Mode Tabs */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '30px', background: 'rgba(0,0,0,0.2)', padding: '5px', borderRadius: '12px', width: 'fit-content' }}>
              <button
                type="button"
                onClick={() => setInputType('keyword')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: inputType === 'keyword' ? 'var(--primary)' : 'transparent',
                  color: inputType === 'keyword' ? '#fff' : 'var(--text-dim)',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: '0.3s'
                }}
              >
                <Search size={16} /> Pencarian Pintar
              </button>
              <button
                type="button"
                onClick={() => setInputType('url')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: inputType === 'url' ? 'var(--primary)' : 'transparent',
                  color: inputType === 'url' ? '#fff' : 'var(--text-dim)',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: '0.3s'
                }}
              >
                <LinkIcon size={16} /> Link YouTube Asli
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', marginBottom: '30px' }}>
              {inputType === 'keyword' ? (
                <InputField
                  label="Kata Kunci Pencarian"
                  placeholder="Misalnya: Artificial Intelligence, Bisnis, Startup"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  icon={<Search size={18} />}
                  required
                />
              ) : (
                <InputField
                  label="Link YouTube Langsung"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  icon={<Video size={18} />}
                  required
                />
              )}

              {/* Responsiveness Fixed: Auto-fit minmax instead of rigid 1fr 1fr 1fr */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '30px' }}>
                <SelectField
                  label="Tipe Konten"
                  value={videoType}
                  onChange={(e) => setVideoType(e.target.value)}
                  options={[
                    { value: 'podcast', label: 'Podcast (Fokus Tengah)' },
                    { value: 'talking_head', label: 'Talking Head (Fokus Tengah)' }
                  ]}
                />

                <SelectField
                  label="Durasi Clip Pendek"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  options={[
                    { value: '30-45', label: '30 - 45 Detik' },
                    { value: '45-60', label: '45 - 60 Detik' },
                    { value: '60-75', label: '60 - 75 Detik' },
                    { value: '75-90', label: '75 - 90 Detik' }
                  ]}
                />

                <InputField
                  label="Jumlah Klip (Max)"
                  type="number"
                  min="0"
                  max="100"
                  placeholder="0 untuk unlimited"
                  value={maxClips}
                  onChange={(e) => setMaxClips(e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-glass)', paddingTop: '30px' }}>
              <Button type="submit" variant="primary" icon={<Sparkles size={18} style={{ marginRight: '8px' }} />}>
                Mulai Jalankan Agent AI
              </Button>
            </div>
          </GlassCard>
        </form>
      ) : (
        <GlassCard glow={true} padding="40px" style={{ textAlign: 'center' }}>
          {errorState ? (
            <div style={{ 
              background: 'rgba(234, 33, 67, 0.1)', 
              border: '1px solid var(--danger)', 
              borderRadius: '16px', 
              padding: '40px',
              maxWidth: '600px',
              margin: '0 auto'
            }}>
              <AlertCircle size={48} color="var(--danger)" style={{ margin: '0 auto 20px' }} />
              <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '12px', color: '#fff' }}>Operasi Dibatalkan</h2>
              <p style={{ color: 'var(--text-dim)', marginBottom: '30px', lineHeight: 1.6 }}>
                {errorState}
              </p>
              <Button onClick={resetState} variant="secondary" icon={<RefreshCw size={18} style={{ marginRight: '8px' }} />}>
                Kembali & Coba Lagi
              </Button>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: '30px', position: 'relative', display: 'inline-block' }}>
                <Spinner size="lg" color="accent" />
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  color: 'var(--accent)'
                }}>
                  <Sparkles size={24} />
                </div>
              </div>

              <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '12px' }}>AI Pipeline Sedang Berjalan</h2>
              <p style={{ color: 'var(--text-dim)', marginBottom: '35px', maxWidth: '550px', margin: '0 auto 35px' }}>
                LangGraph Agent Orchestrator sedang memotong klip terbaik untuk Anda. Proses ini memakan waktu kurang dari 1 menit.
              </p>

              <div style={{ marginBottom: '40px' }}>
                <ProgressBar progress={progress} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', textAlign: 'left', maxWidth: '500px', margin: '0 auto' }}>
                {steps.map((step, idx) => {
                  const isPast = currentStep > idx
                  const isCurrent = currentStep === idx
                  const isFuture = currentStep < idx
                  return (
                    <div key={idx} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '15px',
                      opacity: isFuture ? 0.3 : 1,
                      transition: 'opacity 0.3s'
                    }}>
                      {isPast ? (
                        <CheckCircle size={20} color="var(--accent)" />
                      ) : isCurrent ? (
                        <Loader2 size={20} color="var(--primary)" style={{ animation: 'spin 1s linear infinite' }} />
                      ) : (
                        <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: '2px solid var(--text-muted)' }}></div>
                      )}
                      <span style={{
                        fontSize: '15px',
                        fontWeight: isCurrent ? 600 : 400,
                        color: isCurrent ? 'var(--text-primary)' : 'var(--text-dim)'
                      }}>{step.label}</span>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </GlassCard>
      )}
    </div>
  )
}
