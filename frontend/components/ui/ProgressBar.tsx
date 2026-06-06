import React from 'react'

interface ProgressBarProps {
  progress: number // 0 to 100
  height?: string
  animated?: boolean
  style?: React.CSSProperties
  className?: string
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress,
  height = '8px',
  animated = true,
  style,
  className = ''
}) => {
  // Clamp progress between 0 and 100
  const clampedProgress = Math.min(Math.max(progress, 0), 100)

  return (
    <div
      className={className}
      style={{
        height,
        background: 'var(--bg-glass)',
        borderRadius: '10px',
        width: '100%',
        overflow: 'hidden',
        border: '1px solid var(--border-glass)',
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)',
        ...style
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${clampedProgress}%`,
          background: 'linear-gradient(90deg, var(--primary), var(--accent))',
          borderRadius: '10px',
          boxShadow: '0 0 12px var(--accent-glow)',
          transition: animated ? 'width 0.4s ease-out' : 'none'
        }}
      />
    </div>
  )
}

export default ProgressBar
