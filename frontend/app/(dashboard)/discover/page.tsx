'use client'

import React, { useState } from 'react'
import { Sparkles, Search, CheckCircle, Loader2, Link as LinkIcon, Video } from 'lucide-react'
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

  const steps = [
    { label: 'Discovery Agent: Mencari video terbaik di YouTube...', duration: 3000 },
    { label: 'Analyzer Agent: Menganalisis transkrip viral via Groq...', duration: 4000 },
    { label: totalScenes > 0 ? `Processor Agent: Memotong klip (${processedScenes}/${totalScenes})...` : 'Processor Agent: Memotong klip & menghasilkan subtitle...', duration: 8000 },
    { label: 'Scheduler Agent: Menjadwalkan post otomatis...', duration: 2000 }
  ]

  const handleStartPipeline = async (e: React.FormEvent) => {
    e.preventDefault()
    if (inputType === 'keyword' && !keyword) return
    if (inputType === 'url' && !youtubeUrl) return
    
    setIsRunning(true)
    setCurrentStep(0)
    setProgress(0)

    try {
      // Get the current user's JWT from Supabase to authenticate with FastAPI
      const { data: { session } } = await supabase.auth.getSession()
      
      // If session is missing, use a dummy token with a valid UUID for local testing
      const dummyToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMTExMTExMS0yMjIyLTMzMzMtNDQ0NC01NTU1NTU1NTU1NTUiLCJlbWFpbCI6InRlc3RAdGVzdC5jb20ifQ."
      const token = session?.access_token || dummyToken

      // Send real request to backend API
      const res = await fetch('http://localhost:8000/api/jobs', {
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
        throw new Error('Gagal memulai AI Pipeline')
      }
      const data = await res.json()
      const jobId = data.job?.id || data.job_id
      
      // Simulate initial progress for Discovery and Analyzer steps (0 to 45%)
      let initialSimulatedProgress = 10
      const initialInterval = setInterval(() => {
        initialSimulatedProgress += 5
        if (initialSimulatedProgress >= 45) clearInterval(initialInterval)
        setProgress(prev => Math.max(prev, initialSimulatedProgress))
      }, 2000)

      // Poll real backend status via Supabase every 3 seconds
      const pollInterval = setInterval(async () => {
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
            setIsRunning(false)
            alert("Pipeline backend gagal memproses video. Silakan cek log server backend.")
          } else if (total > 0) {
            // We are in the processing phase
            clearInterval(initialInterval)
            setCurrentStep(2)
            
            // Calculate real progress for step 2 (50% to 90%)
            const processProgress = 50 + (processed / total) * 40
            setProgress(processProgress)
            
            // Update labels dynamically via state or directly in render
            // We'll manage this by storing total and processed in state
            setTotalScenes(total)
            setProcessedScenes(processed)
          } else {
            // Still analyzing (Step 1)
            setCurrentStep(1)
          }
        } else if (error) {
          clearInterval(pollInterval)
          clearInterval(initialInterval)
          setIsRunning(false)
          alert("Gagal membaca status pipeline dari database.")
        }
      }, 3000)
      
    } catch (error) {
      console.error(error)
      setIsRunning(false)
      alert("Terjadi kesalahan saat memulai pipeline.")
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '30px' }}>
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
