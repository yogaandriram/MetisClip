import React from 'react'

interface SkeletonProps {
  width?: string | number
  height?: string | number
  circle?: boolean
  style?: React.CSSProperties
  className?: string
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = '16px',
  circle = false,
  style,
  className = ''
}) => {
  const combinedStyles: React.CSSProperties = {
    width,
    height,
    borderRadius: circle ? '50%' : '8px', // Standard 8px rounded corners from DESIGN.md
    background: 'linear-gradient(90deg, var(--bg-glass) 25%, var(--bg-glass-hover) 50%, var(--bg-glass) 75%)', // Uses color variables
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s infinite linear',
    ...style
  }

  return (
    <div className={className} style={combinedStyles}>
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </div>
  )
}

export default Skeleton
