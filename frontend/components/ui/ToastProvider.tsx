import React from 'react'
import { Toaster } from 'react-hot-toast'

export const ToastProvider: React.FC = () => {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        // Default options for all toasts
        style: {
          background: 'rgba(7, 7, 15, 0.85)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid var(--border-glass)',
          color: 'var(--text-primary)',
          boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.35)',
          borderRadius: '12px',
          fontFamily: 'var(--font-sans)',
          fontSize: '14px',
          fontWeight: 500,
        },
        success: {
          iconTheme: {
            primary: 'var(--accent)',
            secondary: '#000',
          },
          style: {
            border: '1px solid rgba(7, 202, 107, 0.3)',
            boxShadow: '0 0 15px rgba(7, 202, 107, 0.1)',
          },
        },
        error: {
          iconTheme: {
            primary: 'var(--danger)',
            secondary: '#fff',
          },
          style: {
            border: '1px solid rgba(234, 33, 67, 0.3)',
            boxShadow: '0 0 15px rgba(234, 33, 67, 0.1)',
          },
        },
        duration: 4000,
      }}
    />
  )
}

export default ToastProvider
