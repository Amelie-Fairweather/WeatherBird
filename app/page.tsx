"use client";

import "./globals.css";
import Link from "next/link";
import { useRef, useEffect, useState } from "react";
import WeatherAlertsBanner from "@/components/WeatherAlertsBanner";

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export default function MyComponent() {
  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatLocation, setChatLocation] = useState("Vermont");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(0);
  const heroRef = useRef<HTMLDivElement>(null);
  const introRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    console.log("Component mounted");
    
    // Smooth video loop handler
    const video = videoRef.current;
    if (video) {
      const handleVideoEnd = () => {
        // Smoothly restart the video by going back to start
        video.currentTime = 0;
        video.play().catch(() => {
          // Autoplay might be blocked, but loop attribute should handle it
        });
      };
      
      video.addEventListener('ended', handleVideoEnd);
      
      return () => {
        video.removeEventListener('ended', handleVideoEnd);
      };
    }
  }, []);

  // Parallax scroll effect
  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: chatInput,
      timestamp: new Date().toISOString(),
    };

    // Add user message immediately
    setMessages(prev => [...prev, userMessage]);
    setChatInput("");
    setChatLoading(true);

    try {
      // Send last 6 messages (3 user + 3 assistant = context for conversation flow)
      const recentHistory = messages.slice(-6).map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
      }));

      const response = await fetch('/api/weather/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: chatInput,
          location: chatLocation,
          conversationHistory: recentHistory,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: data.prediction || "Sorry, I couldn't generate a response.",
          timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        const errorMessage: ChatMessage = {
          role: 'assistant',
          content: `Error: ${data.error || 'Something went wrong'}`,
          timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    } catch (err) {
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: 'Error connecting to Maple. Please try again.',
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setChatLoading(false);
    }
  };

  // Calculate parallax transforms
  const imageTransform = `translateY(${scrollY * 0.5}px)`;
  const imageOpacity = Math.max(0, 1 - scrollY / 400);
  const introOpacity = Math.min(1, (scrollY - 200) / 300);
  const introTransform = `translateY(${Math.max(0, 200 - scrollY)}px)`;

  return (
    <div className="relative">
      {/* Weather Alerts Banner - Fixed at top, updates every hour */}
      <WeatherAlertsBanner location={chatLocation} updateInterval={3600000} />
      
      {/* Hero Section - Fixed/Parallax */}
      <div 
        ref={heroRef}
        className="fixed top-7 left-0 w-full h-screen flex flex-col items-center justify-center z-10 overflow-hidden"
        style={{ 
          opacity: imageOpacity
        }}
      >
        {/* Video Background */}
        <video
          ref={videoRef}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          className="absolute inset-0 w-full h-full object-cover z-0"
          style={{ transform: imageTransform }}
        >
          <source src="/winter.mp4" type="video/mp4" />
        </video>
        {/* Dark overlay for better text readability */}
        <div className="absolute inset-0 bg-black/40 z-0"></div>
        {/* Navigation Buttons - inside hero section to move with parallax */}
        {/* Add top padding to account for alerts banner (banner height ~70px) */}
        <div className="absolute top-0 left-0 w-full z-10" style={{ opacity: imageOpacity, paddingTop: '70px' }}>
          <div className="bg-white w-full px-6 py-2 pb-10">
            <div className="flex items-center justify-center gap-6">
              <Link 
                href="/snow"
                className=" w-36 h-14 flex items-center justify-center bg-white text-[var(--darkBlue)] font-cormorant font-bold text-lg"
              >
                SNOW
              </Link>
              <Link 
                href="/rain"
                className="w-36 h-14 flex items-center justify-center bg-white text-[var(--darkBlue)] font-cormorant font-bold text-lg"
              >
                RAIN
              </Link>
              <Link 
                href="/emergency"
                className="w-36 h-14 flex items-center justify-center bg-white text-[var(--darkBlue)] transition-colors font-cormorant font-bold text-lg"
              >
                EMERGENCY
              </Link>
            </div>
          </div>
        </div>
   
        {/* Welcome Text */}
        <div className="text-center pt-32 pb-4 p-10 relative z-10">
          <span className="text-white text-2xl ">Welcome to </span>
          <span className="text-[var(--offWhite2)] text-8xl font-cormorant font-bold ">WEATHERbird!</span>
        </div>

        {/* Tagline */}
        <div className="text-center text-[var(--offWhite2)] font-cormorant text-4xl pt-6 pb-8 relative z-10">
          Vermonts newest AI powered weather guide
        </div>
        
        {/* Scroll Down Indicator */}
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce z-10">
          <svg 
            width="24" 
            height="24" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            className="text-[var(--offWhite2)]"
          >
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </div>
      </div>

      {/* Spacer to push content below hero */}
      <div className="h-screen"></div>

      {/* Introduction Section - Fades in on scroll */}
      <div 
        ref={introRef}
        className="relative z-20 bg-white"
        style={{ 
          opacity: introOpacity,
          transform: introTransform
        }}
      >
        <div className="text-3xl text-center p-7 pt-20 pb-10 font-cormorant font-bold">
          A brief introduction to our utilities, why and who WeatherBird is
        </div>
        <div className="text-center font-cormorant text-xl pb-10">WeatherBird is a service designed to promote road safety, help mitigate flood damage, and prepare vermont for emergency!</div>
        <div className="text-center font-cormorant text-xl pb-5 ">Below, is our AI driven weather assitant Maple, she'll help you with everything you need to know immediately:
          </div>
          <div className="text-center font-cormorant text-xl pb-10"> snow days, road safety, temperature, and weather a week out!</div>
          <div className="text-center font-cormorant text-xl pb-40"> for more specific details, please visit our other pages, including in depth road and plow data, and flood prediction</div>

        <div className="text-3xl text-center font-cormorant">
         </div>
<div className="font-caveat">
        {/* Chat Interface */}
      <div className="mt-8 max-w-4xl mx-auto px-4">
        <div className="rounded-lg bg-[var(--offWhite)] overflow-hidden text-cormorant shadow-lg border border-[var(--gold)]/30">
          {/* Chat Header */}
          <div className="bg-[var(--gold)] text-[var(--darkBlue)] p-6 text-cormorant border-b border-[var(--goldDark)]/40">
            <h2 className="text-3xl text-cormorant font-semibold text-center font-cormorant">Ask Maple, our bird assistant</h2>
            <p className="text-lg text-center opacity-75 font-cormorant mt-2">Ask me anything about weather, roads or safety in Vermont</p>
          </div>

        
            


          {/* Messages Container */}
          <div className="h-96 overflow-y-auto p-6 bg-white">
            {messages.length === 0 ? (
              <div className="text-center text-gray-600 mt-20">
                <p className="text-3xl font-caveat text-[var(--darkBlue)]">Hi! I'm Maple, your weather assistant.</p>
                <p className="mt-3 text-lg font-cormorant text-gray-600">Ask me about the weather in {chatLocation}!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-md p-4 ${
                        message.role === 'user'
                          ? 'bg-[var(--gold)] text-[var(--darkBlue)] font-caveat'
                          : 'bg-[var(--offWhite)] text-gray-800 font-caveat'
                      }`}
                    >
                      <p className="text-lg whitespace-pre-wrap leading-relaxed">{message.content}</p>
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-[var(--offWhite)] rounded-md p-4">
                      <p className="text-lg text-gray-600 font-caveat italic">Maple is thinking...</p>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Container */}
          <div className="bg-[var(--offWhite)] p-5 border-t border-[var(--gold)]/30">
            <form onSubmit={sendMessage} className="flex gap-3">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask Maple a question..."
                className="flex-1 px-4 py-3 border border-gray-200 rounded focus:outline-none focus:border-[var(--gold)] bg-white text-base font-caveat placeholder-gray-400"
                disabled={chatLoading}
              />
              <button
                type="submit"
                disabled={chatLoading || !chatInput.trim()}
                className="px-6 py-3 bg-[var(--gold)] text-[var(--darkBlue)] font-caveat rounded hover:bg-[var(--goldDark)] disabled:opacity-50 disabled:cursor-not-allowed font-medium text-base transition-colors"
              >
                {chatLoading ? 'Sending...' : 'Send'}
              </button>
            </form>
          </div>
        </div>
      </div>
      </div>
      </div>
            <div className=" bg-white p-15"></div>
    </div>

  );
}
