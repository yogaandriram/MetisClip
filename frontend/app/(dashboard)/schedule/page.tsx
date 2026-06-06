'use client'

import React, { useState, useEffect } from 'react'
import { Calendar, Clock, Flame, Check, AlertTriangle, ShieldCheck, ArrowRight } from 'lucide-react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { GlassCard } from '../../../components/ui/GlassCard'
import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/Badge'
import { Tabs } from '../../../components/ui/Tabs'

export default function Schedule() {
  const [activeTab, setActiveTab] = useState('queue')
  const [successScheduled, setSuccessScheduled] = useState(false)

  const tabsOptions = [
    { id: 'queue', label: 'Daftar Antrean Posting' },
    { id: 'calendar', label: 'Kalender Visual (Mingguan)' }
  ]

  // AI predicted optimal posting times based on audience traffic peak
  const optimalSlots = [
    { day: 'Senin', time: '17:30 WIB', traffic: 'Tinggi (88%)' },
    { day: 'Selasa', time: '19:45 WIB', traffic: 'Sangat Tinggi (92%)' },
    { day: 'Rabu', time: '17:30 WIB', traffic: 'Tinggi (85%)' },
    { day: 'Kamis', time: '19:45 WIB', traffic: 'Sangat Tinggi (94%)' },
    { day: 'Jumat', time: '18:15 WIB', traffic: 'Ekstrem (97%)' }
  ]

  const supabase = createClientComponentClient()
  const [scheduledPosts, setScheduledPosts] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchScheduledPosts() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        
        const { data, error } = await supabase
          .from('scheduled_posts')
          .select('*, clips(*)')
          // .order('scheduled_at', { ascending: true }) // If needed

        if (error) {
          console.error("Error fetching scheduled posts:", error)
          return
        }

        if (data) {
          const formattedPosts = data.map(post => {
            // Format the ISO datetime to readable strings
            const dateObj = new Date(post.scheduled_at)
            
            // Format date: "Selasa, 2 Juni 2026"
            const dateStr = dateObj.toLocaleDateString('id-ID', { 
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
            })
            
            // Format time: "19:45 WIB"
            const timeStr = dateObj.toLocaleTimeString('id-ID', {
              hour: '2-digit', minute: '2-digit'
            }) + " WIB"

            return {
              id: post.id,
              title: post.title || post.clips?.hook_text?.substring(0, 50) || "Auto Scheduled Post",
              platform: post.platform === 'youtube_shorts' ? 'YouTube Shorts' : post.platform,
              date: dateStr,
              time: timeStr,
              status: post.status,
              viral_score: post.clips?.viral_score || 90
            }
          })
          setScheduledPosts(formattedPosts)
        }
      } catch (err) {
        console.error(err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchScheduledPosts()
  }, [supabase])

  const handleManualTrigger = () => {
    setSuccessScheduled(true)
    setTimeout(() => {
      setSuccessScheduled(false)
    }, 3000)
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      {/* Header title */}
      <div style={{ marginBottom: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '800', marginBottom: '8px' }}>Jadwal Postingan AI</h1>
          <p style={{ color: 'var(--text-muted)' }}>Sistem menjadwalkan otomatis berdasarkan jam ramai audiens dari topik video Anda.</p>
        </div>
        <Button variant="primary" onClick={handleManualTrigger}>
          {successScheduled ? (
            <>Berhasil Menyelaraskan <Check size={16} style={{ marginLeft: '8px' }} /></>
          ) : (
            'Hubungkan Ke YouTube Channel'
          )}
        </Button>
      </div>

      {/* Main Layout Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '30px' }}>
        
        {/* Left Side: Calendar Queue list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Navigation toggles */}
          <div style={{ marginBottom: '20px' }}>
            <Tabs tabs={tabsOptions} activeTab={activeTab} onChange={setActiveTab} />
          </div>

          {activeTab === 'queue' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {scheduledPosts.map((post) => (
                <GlassCard key={post.id} glow={true} padding="24px" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Badge variant="primary" glow={false}>
                        {post.platform}
                      </Badge>
                      <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Mempunyai {post.viral_score}% Virality Score</span>
                    </div>
                    <h3 style={{ fontSize: '18px', fontWeight: '700' }}>{post.title}</h3>
                    
                    <div style={{ display: 'flex', gap: '20px', fontSize: '13px', color: 'var(--text-dim)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Calendar size={14} color="var(--accent)" /> {post.date}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={14} color="var(--accent)" /> {post.time}
                      </span>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <Badge variant="success" glow={true}>Terjadwalkan</Badge>
                  </div>
                </GlassCard>
              ))}
            </div>
          ) : (
            /* Weekly visual grid calendar mockup */
            <GlassCard padding="24px">
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: '10px',
                textAlign: 'center'
              }}>
                {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((day) => (
                  <div key={day} style={{ fontWeight: 'bold', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '10px' }}>{day}</div>
                ))}
                
                {/* 35 Mock Calendar Cells */}
                {Array.from({ length: 28 }).map((_, idx) => {
                  const isScheduled1 = idx === 1; // Tuesday
                  const isScheduled2 = idx === 3; // Thursday
                  return (
                    <div
                      key={idx}
                      style={{
                        height: '75px',
                        background: isScheduled1 || isScheduled2 ? 'rgba(124, 58, 237, 0.1)' : 'rgba(255, 255, 255, 0.01)',
                        border: isScheduled1 || isScheduled2 ? '1px solid var(--primary)' : '1px solid var(--border-glass)',
                        borderRadius: '8px',
                        padding: '6px',
                        textAlign: 'left',
                        fontSize: '11px',
                        position: 'relative'
                      }}
                    >
                      <span style={{ color: 'var(--text-muted)' }}>{idx + 1}</span>
                      {(isScheduled1 || isScheduled2) && (
                        <div style={{
                          background: 'var(--primary)',
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          position: 'absolute',
                          bottom: '8px',
                          right: '8px',
                          boxShadow: '0 0 10px var(--primary)'
                        }}></div>
                      )}
                    </div>
                  )
                })}
              </div>
            </GlassCard>
          )}
        </div>

        {/* Right Side: AI Analytics peak time recommendation panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <GlassCard glow={true} padding="24px">
            <h3 style={{ fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '15px' }}>
              <Flame size={18} color="var(--accent)" /> Rekomendasi Jam Ramai
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '20px' }}>
              Berdasarkan analisis performa topik <strong>AI / Teknologi</strong>, slot waktu berikut mendatangkan retensi penonton paling tinggi.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {optimalSlots.map((slot, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'rgba(255,255,255,0.02)',
                    padding: '10px 15px',
                    borderRadius: '10px',
                    border: '1px solid var(--border-glass)'
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>{slot.day} - {slot.time}</span>
                    <span style={{ fontSize: '11px', color: 'var(--accent)' }}>Sinyal Peak: {slot.traffic}</span>
                  </div>
                  <Clock size={16} color="var(--text-muted)" />
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Secure distribution notice */}
          <GlassCard padding="20px" style={{ border: '1px dashed rgba(6, 214, 160, 0.4)', background: 'rgba(6,214,160,0.02)' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <ShieldCheck size={20} color="var(--accent)" style={{ flexShrink: 0 }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600 }}>Distribusi Aman</span>
                <span style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.4 }}>
                  Postingan dijadwalkan menggunakan YouTube API resmi dengan enkripsi token ganda.
                </span>
              </div>
            </div>
          </GlassCard>
        </div>

      </div>
    </div>
  )
}
