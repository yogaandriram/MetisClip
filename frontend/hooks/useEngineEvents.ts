'use client'

import { useEffect, useRef } from 'react'
import { subscribeEvents, type EngineEvent } from '@/lib/engine'

/**
 * Subscribes to engine WebSocket events for the lifetime of the component.
 * The handler may change between renders; the latest one is always called.
 */
export function useEngineEvents(handler: (event: EngineEvent) => void, enabled = true) {
  const ref = useRef(handler)
  ref.current = handler

  useEffect(() => {
    if (!enabled) return
    return subscribeEvents((event) => ref.current(event))
  }, [enabled])
}
