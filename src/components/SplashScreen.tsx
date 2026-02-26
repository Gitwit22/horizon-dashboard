import { useEffect, useState } from 'react'

interface SplashScreenProps {
  onComplete: () => void
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    // Show splash for 2.5 seconds
    const timer = setTimeout(() => {
      setIsVisible(false)
      // Wait for fade animation to complete
      setTimeout(onComplete, 500)
    }, 2500)

    return () => clearTimeout(timer)
  }, [onComplete])

  if (!isVisible) return null

  return (
    <div className={`fixed inset-0 bg-black flex flex-col items-center justify-center z-50 transition-opacity duration-500 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
      {/* Logo */}
      <div className="mb-8 animate-pulse">
        <img
          src="/assets/icon.png"
          alt="Horizon Logo"
          className="w-64 h-64 object-contain drop-shadow-2xl"
        />
      </div>

      {/* Loading Text */}
      <div className="text-center">
        <p className="text-white text-lg font-light tracking-widest mb-4">
          Loading Horizon Console
        </p>
        
        {/* Animated Loading Dots */}
        <div className="flex justify-center gap-2">
          <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
          <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
        </div>
      </div>

      {/* Version Info */}
      <div className="absolute bottom-4 text-gray-600 text-sm">
        Horizon Console v1.0.0
      </div>
    </div>
  )
}
