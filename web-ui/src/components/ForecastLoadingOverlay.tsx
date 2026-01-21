'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import loadingPhrasesConfig from '@/config/loading-phrases.json';

interface ForecastLoadingOverlayProps {
  isVisible: boolean;
}

export default function ForecastLoadingOverlay({ isVisible }: ForecastLoadingOverlayProps) {
  const [currentPhrase, setCurrentPhrase] = useState('');
  const [dots, setDots] = useState('');

  // Use ref for tracking used indices to avoid re-render loops
  const usedIndicesRef = useRef<Set<number>>(new Set());
  const phrases = loadingPhrasesConfig.phrases;

  // Get a random phrase that hasn't been used recently
  const getRandomPhrase = useCallback(() => {
    const usedIndices = usedIndicesRef.current;

    // If we've used most phrases, reset the used set
    if (usedIndices.size >= phrases.length - 5) {
      usedIndicesRef.current = new Set();
    }

    let randomIndex: number;
    let attempts = 0;

    // Find an unused phrase (with safety limit)
    do {
      randomIndex = Math.floor(Math.random() * phrases.length);
      attempts++;
    } while (usedIndicesRef.current.has(randomIndex) && attempts < 50);

    usedIndicesRef.current.add(randomIndex);
    return phrases[randomIndex];
  }, [phrases]);

  // Set initial phrase and rotate through phrases
  useEffect(() => {
    if (!isVisible) return;

    // Set initial random phrase
    setCurrentPhrase(getRandomPhrase());

    const messageInterval = setInterval(() => {
      setCurrentPhrase(getRandomPhrase());
    }, 2500);

    return () => clearInterval(messageInterval);
  }, [isVisible, getRandomPhrase]);

  // Animate dots
  useEffect(() => {
    if (!isVisible) return;

    const dotsInterval = setInterval(() => {
      setDots(prev => {
        if (prev === '...') return '';
        return prev + '.';
      });
    }, 400);

    return () => clearInterval(dotsInterval);
  }, [isVisible]);

  // Reset state when becoming visible
  useEffect(() => {
    if (isVisible) {
      usedIndicesRef.current = new Set();
      setDots('');
    }
  }, [isVisible]);

  if (!isVisible) return null;

  // Remove trailing "..." from phrase if present (we add our own animated dots)
  const displayPhrase = currentPhrase.replace(/\.{3}$/, '');

  return (
    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center z-20 rounded-lg">
      {/* Animated thinking indicator - Claude Code style */}
      <div className="flex items-center space-x-2 mb-4">
        {/* Pulsing circles animation */}
        <div className="flex space-x-1">
          <div className="w-3 h-3 bg-[#005F73] rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
          <div className="w-3 h-3 bg-[#0A9396] rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
          <div className="w-3 h-3 bg-[#94D2BD] rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
        </div>

        {/* Bouncing wind icon */}
        <svg
          className="w-6 h-6 text-[#005F73] animate-bounce"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M14 5l7 7m0 0l-7 7m7-7H3"
          />
        </svg>
      </div>

      {/* Thinking text with typing effect */}
      <div className="text-center px-4">
        <p className="text-lg font-medium text-gray-700 mb-1">
          Generating fresh forecast{dots}
        </p>
        <p className="text-sm text-gray-500 h-5 transition-all duration-300 ease-in-out">
          {displayPhrase}
        </p>
      </div>

      {/* Subtle spinning loader underneath */}
      <div className="mt-4">
        <div className="w-8 h-8 border-2 border-[#005F73]/20 border-t-[#005F73] rounded-full animate-spin" />
      </div>
    </div>
  );
}
