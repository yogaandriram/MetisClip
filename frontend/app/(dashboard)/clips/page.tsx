'use client'

import React, { useState, useEffect } from 'react'
import { Play, Download, Calendar, Flame, Check, Loader2 } from 'lucide-react'
import { GlassCard } from '../../../components/ui/GlassCard'
import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/Badge'
import { Divider } from '../../../components/ui/Divider'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export default function Clips() {
  const supabase = createClientComponentClient()
  const [downloadedClipId, setDownloadedClipId] = useState<string | null>(null)
  const [clips, setClips] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchClips() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const userId = session?.user?.id
        
        // Fetch clips from database (assuming 'created_at' exists, otherwise just fetch)
        const { data, error } = await supabase
          .from('clips')
          .select('*')
          // .order('created_at', { ascending: false }) // Might not exist if not created yet, so just fetch
          
        if (error) {
          console.error("Error fetching clips:", error)
          setIsLoading(false)
          return
        }

        if (data) {
          // Format data and get public URLs for thumbnails
          const formattedClips = data.map(clip => {
            let thumbnailUrl = ''
            if (clip.thumbnail_path && clip.thumbnail_path.includes('/') && !clip.thumbnail_path.includes('tmp')) {
               const { data: publicUrlData } = supabase.storage.from('clips').getPublicUrl(clip.thumbnail_path)
               thumbnailUrl = publicUrlData.publicUrl
            } else {
               thumbnailUrl = 'https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?q=80&w=1080&auto=format&fit=crop'
            }

            let parsedTags = ['ai', 'shorts']
            if (clip.tags) {
              try {
                parsedTags = typeof clip.tags === 'string' ? JSON.parse(clip.tags) : clip.tags
              } catch (e) {
                console.error("Failed to parse tags:", e)
              }
            }

            return {
              ...clip,
              title: clip.hook_text ? clip.hook_text.substring(0, 50) + "..." : "MetisClip",
              thumbnail_url: thumbnailUrl,
              tags: Array.isArray(parsedTags) ? parsedTags : ['ai', 'shorts']
            }
          })
          
          setClips(formattedClips.reverse()) // Simple reverse if order not applied in query
        }
      } catch (err) {
        console.error(err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchClips()
  }, [supabase])

  const handleDownload = async (clip: any, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDownloadedClipId(clip.id)
    
    let videoUrl = ''
    if (clip.storage_path && clip.storage_path.includes('/')) {
      const { data } = supabase.storage.from('clips').getPublicUrl(clip.storage_path)
      videoUrl = data.publicUrl
    }

    if (videoUrl) {
      // Create a temporary link to download the video directly
      const link = document.createElement('a')
      link.href = videoUrl
      link.setAttribute('download', `metisclip-${clip.id}.mp4`)
      link.target = '_blank'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } else {
      alert("Video belum tersedia di storage.")
    }
    
    setTimeout(() => {
      setDownloadedClipId(null)
    }, 2000)
  }

  return (
    <div>
      <div style={{ marginBottom: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '800', marginBottom: '8px' }}>Hasil Pemotongan Clip</h1>
          <p style={{ color: 'var(--text-muted)' }}>Klik salah satu clip untuk masuk ke editor subtitle dinamis.</p>
        </div>
        <Button size="sm" onClick={() => window.location.href = '/discover'}>
          + Clip Video Baru
        </Button>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: '30px'
      }}>
        {isLoading ? (
          <div style={{ padding: '40px', textAlign: 'center', gridColumn: '1 / -1' }}>
            <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto', color: 'var(--primary)' }} />
            <p style={{ marginTop: '10px', color: 'var(--text-dim)' }}>Memuat clip dari database...</p>
          </div>
        ) : clips.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', gridColumn: '1 / -1' }}>
            <p style={{ color: 'var(--text-dim)' }}>Belum ada clip yang diekstrak. Silakan mulai discovery job baru.</p>
          </div>
        ) : clips.map((clip) => (
          <GlassCard
            key={clip.id}
            glow={true}
            padding="0px"
            style={{
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              overflow: 'hidden',
              cursor: 'pointer'
            }}
            onClick={() => window.location.href = `/clips/${clip.id}`}
          >
            {/* Thumbnail Box */}
            <div style={{ position: 'relative', width: '100%', aspectRatio: '9/16', background: '#000' }}>
              <img
                src={clip.thumbnail_url}
                alt={clip.title}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  opacity: 0.7
                }}
              />
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '50px',
                height: '50px',
                borderRadius: '50%',
                background: 'rgba(124, 58, 237, 0.9)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 15px var(--primary-glow)'
              }}>
                <Play size={20} color="#fff" fill="#fff" />
              </div>

              {/* Viral score badge using Badge component */}
              <div style={{ position: 'absolute', top: '15px', right: '15px' }}>
                <Badge variant="accent" glow={true} icon={<Flame size={14} fill="var(--accent)" />}>
                  {clip.viral_score}% Viral
                </Badge>
              </div>

              <div style={{
                position: 'absolute',
                bottom: '10px',
                right: '10px',
                padding: '4px 8px',
                background: 'rgba(0,0,0,0.8)',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 'bold'
              }}>
                00:{clip.duration_seconds < 10 ? `0${clip.duration_seconds}` : clip.duration_seconds}
              </div>
            </div>

            {/* Content Details */}
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'flex-start' }}>
              <div style={{ marginBottom: '0px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px', color: '#fff' }}>{clip.title}</h3>
                <p style={{
                  fontSize: '14px',
                  color: 'var(--text-dim)',
                  lineHeight: 1.5,
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  marginBottom: '15px'
                }}>
                  {clip.rationale}
                </p>
                
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {clip.tags?.map((tag: string) => (
                    <Badge key={tag} variant="muted" glow={false}>
                      #{tag}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  )
}
