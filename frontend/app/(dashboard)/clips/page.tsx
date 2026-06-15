'use client'

import React, { useState, useEffect } from 'react'
import { Play, Download, Calendar, Flame, Check, Loader2, MoreVertical, Trash2, Edit2 } from 'lucide-react'
import { GlassCard } from '../../../components/ui/GlassCard'
import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/Badge'
import { Divider } from '../../../components/ui/Divider'
import { Dropdown } from '../../../components/ui/Dropdown'
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
        
        // Fetch clips from database with limit and sorting for performance
        const { data, error } = await supabase
          .from('clips')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50)
          
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
              title: clip.hook_text ? clip.hook_text : "MetisClip",
              thumbnail_url: thumbnailUrl,
              tags: Array.isArray(parsedTags) ? parsedTags : ['ai', 'shorts']
            }
          })
          
          setClips(formattedClips)
        }
      } catch (err) {
        console.error(err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchClips()
  }, [supabase])

  const handleDownload = async (clip: any) => {
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
      alert("Video belum tersedia di storage. Mohon tunggu proses render selesai.")
    }
    
    setTimeout(() => {
      setDownloadedClipId(null)
    }, 2000)
  }

  const handleDelete = async (clipId: string) => {
    if (!window.confirm("Apakah Anda yakin ingin menghapus klip ini secara permanen?")) return;
    
    // Optimistic UI update
    setClips(prev => prev.filter(c => c.id !== clipId))
    
    const { error } = await supabase.from('clips').delete().eq('id', clipId)
    if (error) {
      console.error("Failed to delete clip:", error)
      alert("Terjadi kesalahan. Gagal menghapus klip.")
    }
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
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
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
            className="group"
          >
            {/* Thumbnail Box */}
            <div style={{ position: 'relative', width: '100%', aspectRatio: '9/16', background: '#000', overflow: 'hidden' }}>
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
                  opacity: 0.7,
                  transition: 'transform 0.5s ease'
                }}
                className="group-hover:scale-105"
              />
              
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '50px',
                height: '50px',
                borderRadius: '50%',
                background: clip.storage_path ? 'rgba(24, 86, 255, 0.9)' : 'rgba(0, 0, 0, 0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: clip.storage_path ? '0 0 20px var(--primary-glow)' : 'none',
                transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
              className="group-hover:scale-110"
              >
                {clip.storage_path ? (
                  <Play size={20} color="#fff" fill="#fff" style={{ marginLeft: '4px' }} />
                ) : (
                  <Loader2 size={20} color="var(--warning)" className="animate-spin" />
                )}
              </div>

              {!clip.storage_path && (
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, 40px)',
                  background: 'rgba(0,0,0,0.7)',
                  backdropFilter: 'blur(4px)',
                  padding: '4px 10px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: 'var(--warning)',
                  border: '1px solid var(--warning)'
                }}>
                  Sedang Dirender...
                </div>
              )}

              {/* Badges & Actions Container */}
              <div style={{ position: 'absolute', top: '15px', right: '15px', left: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Badge variant="accent" glow={true} icon={<Flame size={14} fill="var(--accent)" />}>
                  {clip.viral_score}% Viral
                </Badge>
                
                {/* Actions Dropdown */}
                <div onClick={(e) => e.stopPropagation()}>
                  <Dropdown
                    align="right"
                    width="180px"
                    trigger={
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: 'rgba(0,0,0,0.5)',
                        backdropFilter: 'blur(8px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid rgba(255,255,255,0.1)',
                        cursor: 'pointer',
                        transition: 'background 0.2s ease'
                      }} className="hover:bg-white/10">
                        <MoreVertical size={16} color="#fff" />
                      </div>
                    }
                    items={[
                      { id: 'edit', label: 'Edit Subtitle', icon: Edit2, onClick: () => window.location.href = `/clips/${clip.id}` },
                      { id: 'download', label: 'Download Video', icon: downloadedClipId === clip.id ? Check : Download, onClick: () => handleDownload(clip) },
                      { id: 'delete', label: 'Hapus Klip', icon: Trash2, danger: true, onClick: () => handleDelete(clip.id) },
                    ]}
                  />
                </div>
              </div>

              <div style={{
                position: 'absolute',
                bottom: '10px',
                right: '10px',
                padding: '4px 8px',
                background: 'rgba(0,0,0,0.8)',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 'bold',
                letterSpacing: '0.5px'
              }}>
                {String(Math.floor((clip.duration_seconds || 0) / 60)).padStart(2, '0')}:{String(Math.floor((clip.duration_seconds || 0) % 60)).padStart(2, '0')}
              </div>
            </div>

            {/* Content Details */}
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'flex-start' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Calendar size={12} />
                {clip.created_at ? new Date(clip.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Baru saja'}
              </p>
              
              <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px', color: 'var(--text-primary)' }}>{clip.title}</h3>
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
              
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: 'auto' }}>
                {clip.tags?.map((tag: string) => (
                  <Badge key={tag} variant="muted" glow={false}>
                    #{tag}
                  </Badge>
                ))}
              </div>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  )
}
