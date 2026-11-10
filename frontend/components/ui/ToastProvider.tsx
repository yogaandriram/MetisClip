'use client'

import React from 'react'
import { Toaster } from 'react-hot-toast'

/** Ink toasts, bottom-right (DESIGN.md §8.13). Errors stay until closed or replaced. */
export function ToastProvider() {
  return (
    <Toaster
      position="bottom-right"
      gutter={8}
      containerStyle={{ bottom: 24, right: 24 }}
      toastOptions={{
        duration: 5000,
        style: {
          background: 'var(--ink)',
          color: 'var(--on-ink)',
          borderRadius: 'var(--r-md)',
          padding: '12px 16px',
          maxWidth: 420,
          font: '500 14px/20px var(--font-text)',
          boxShadow: 'var(--shadow-1)',
        },
        success: { iconTheme: { primary: 'var(--leaf)', secondary: 'var(--ink)' } },
        error: { duration: 8000, iconTheme: { primary: 'var(--surface)', secondary: 'var(--ink)' } },
        loading: { iconTheme: { primary: 'var(--leaf)', secondary: 'var(--ink-line)' } },
      }}
    />
  )
}

export default ToastProvider
