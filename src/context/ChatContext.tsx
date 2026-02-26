import React, { createContext, useState, useCallback, useRef, useEffect } from 'react'

export interface Message {
  id: string
  sender: 'user' | 'horizon'
  text: string
  timestamp: Date
}

interface ChatContextType {
  messages: Message[]
  addMessage: (sender: 'user' | 'horizon', text: string) => void
  sendMessage: (text: string) => Promise<void>
  clearChat: () => void
  isConnected: boolean
}

export const ChatContext = createContext<ChatContextType | undefined>(undefined)

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  // Initialize WebSocket connection
  useEffect(() => {
    const connectWebSocket = () => {
      try {
        const gatewayUrl = import.meta.env.VITE_GATEWAY_URL || 'http://10.0.0.194:3001'
        const wsUrl = gatewayUrl.replace('http', 'ws')
        
        const ws = new WebSocket(`${wsUrl}/ws/chat`)
        
        ws.onopen = () => {
          console.log('Chat WebSocket connected')
          setIsConnected(true)
        }
        
        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            if (message.type === 'message') {
              addMessage('horizon', message.text)
            }
          } catch (error) {
            console.error('Chat message error:', error)
          }
        }
        
        ws.onerror = () => setIsConnected(false)
        ws.onclose = () => {
          setIsConnected(false)
          // Attempt reconnect after 3 seconds
          setTimeout(connectWebSocket, 3000)
        }
        
        wsRef.current = ws
      } catch (error) {
        console.error('WebSocket connection failed:', error)
      }
    }

    connectWebSocket()
    
    return () => {
      wsRef.current?.close()
    }
  }, [])

  const addMessage = useCallback((sender: 'user' | 'horizon', text: string) => {
    const newMessage: Message = {
      id: `msg_${Date.now()}`,
      sender,
      text,
      timestamp: new Date()
    }
    setMessages(prev => [...prev, newMessage])
  }, [])

  const sendMessage = useCallback(async (text: string) => {
    // Add user message to UI
    addMessage('user', text)
    
    // Send via WebSocket if connected
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'message',
        text,
        timestamp: new Date()
      }))
    } else {
      // Fallback to HTTP POST
      try {
        const gatewayUrl = import.meta.env.VITE_GATEWAY_URL || 'http://10.0.0.194:3001'
        const response = await fetch(`${gatewayUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text })
        })
        
        if (response.ok) {
          const data = await response.json()
          if (data.reply) {
            addMessage('horizon', data.reply)
          }
        }
      } catch (error) {
        console.error('Failed to send message:', error)
        addMessage('horizon', 'Connection error. Please try again.')
      }
    }
  }, [addMessage])

  const clearChat = useCallback(() => {
    setMessages([])
  }, [])

  return (
    <ChatContext.Provider value={{ messages, addMessage, sendMessage, clearChat, isConnected }}>
      {children}
    </ChatContext.Provider>
  )
}

export function useChat() {
  const context = React.useContext(ChatContext)
  if (!context) {
    throw new Error('useChat must be used within ChatProvider')
  }
  return context
}
