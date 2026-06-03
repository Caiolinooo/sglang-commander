import { useRef, useEffect, useState, useCallback } from 'react'

type MessageHandler = (data: unknown) => void

export function useWebSocket(url: string, onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  useEffect(() => {
    const socket = new WebSocket(url)
    wsRef.current = socket

    socket.onopen = () => setIsConnected(true)
    socket.onclose = () => setIsConnected(false)
    socket.onerror = () => setIsConnected(false)
    socket.onmessage = (event) => {
      try {
        onMessageRef.current(JSON.parse(event.data))
      } catch {
        onMessageRef.current(event.data)
      }
    }

    return () => socket.close(1000, 'unmount')
  }, [url])

  const send = useCallback((data: unknown) => {
    wsRef.current?.send(JSON.stringify(data))
  }, [])

  return { isConnected, send }
}
