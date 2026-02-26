import React, { useState, useRef, useEffect } from 'react'
import { useChat } from '@/context/ChatContext'

export function ChatWidget() {
  const { messages, sendMessage, isConnected } = useChat()
  const [isOpen, setIsOpen] = useState(false)
  const [isFloating, setIsFloating] = useState(false)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [position, setPosition] = useState({ x: 20, y: 20 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const widgetRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Handle drag
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input')) return
    setIsDragging(true)
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    })
  }

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y
      })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, dragOffset])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return

    setIsLoading(true)
    try {
      await sendMessage(input)
      setInput('')
    } finally {
      setIsLoading(false)
    }
  }

  // Bubble view (closed)
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-orange-500 hover:bg-orange-600 text-white rounded-full shadow-lg flex items-center justify-center text-2xl z-40 transition-transform hover:scale-110"
        title="Open chat"
      >
        💬
      </button>
    )
  }

  // Floating window or main panel
  const containerClass = isFloating
    ? `fixed rounded-lg shadow-2xl border border-slate-700 z-50 flex flex-col`
    : `flex flex-col h-full bg-slate-900 rounded-lg`

  const containerStyle = isFloating
    ? {
        width: '400px',
        height: '600px',
        left: `${position.x}px`,
        top: `${position.y}px`,
        backgroundColor: '#0f172a',
        cursor: isDragging ? 'grabbing' : 'grab'
      }
    : {}

  return (
    <div
      ref={widgetRef}
      className={containerClass}
      style={containerStyle}
      onMouseDown={isFloating ? handleMouseDown : undefined}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-800">
        <div>
          <h2 className="text-lg font-semibold text-white">Horizon Chat</h2>
          <p className={`text-xs ${isConnected ? 'text-green-400' : 'text-yellow-400'}`}>
            {isConnected ? '🟢 Connected' : '🟡 Connecting...'}
          </p>
        </div>
        <div className="flex gap-2">
          {!isFloating && (
            <button
              onClick={() => setIsFloating(true)}
              className="text-slate-400 hover:text-white text-sm"
              title="Pop out"
            >
              ⛶
            </button>
          )}
          {isFloating && (
            <button
              onClick={() => setIsFloating(false)}
              className="text-slate-400 hover:text-white text-sm"
              title="Minimize"
            >
              ⊕
            </button>
          )}
          <button
            onClick={() => setIsOpen(false)}
            className="text-slate-400 hover:text-white text-sm"
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500 text-center text-sm">
            <p>Chat with Horizon here!</p>
          </div>
        ) : (
          messages.map(msg => (
            <div
              key={msg.id}
              className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-xs px-3 py-2 rounded text-sm ${
                  msg.sender === 'user'
                    ? 'bg-orange-500 text-white'
                    : 'bg-slate-700 text-slate-100'
                }`}
              >
                <p>{msg.text}</p>
                <p className="text-xs opacity-60 mt-1">
                  {msg.timestamp.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-700 bg-slate-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={isLoading || !isConnected}
            placeholder="Message..."
            className="flex-1 px-2 py-1 text-sm bg-slate-700 text-white border border-slate-600 rounded focus:outline-none focus:border-orange-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !isConnected || !input.trim()}
            className="px-3 py-1 text-sm bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50"
          >
            →
          </button>
        </div>
      </form>
    </div>
  )
}
