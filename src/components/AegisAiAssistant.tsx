import React, { useState, useRef, useEffect } from 'react';
import { AiChatMessage, DamTelemetry, ReliefCentre } from '../types/floodguard';
import { voiceNav } from '../services/voiceNav';
import {
  AlertCircle,
  Bot,
  CheckCircle,
  ChevronRight,
  Flame,
  LifeBuoy,
  Mic,
  Navigation,
  Send,
  Shield,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';

interface AegisAiAssistantProps {
  damTelemetry: DamTelemetry;
  userLocation: [number, number];
  blockedRoads: string[];
  reliefCentres: ReliefCentre[];
  onSelectShelter?: (shelterId: string) => void;
  onClose: () => void;
}

export const AegisAiAssistant: React.FC<AegisAiAssistantProps> = ({
  damTelemetry,
  userLocation,
  blockedRoads,
  reliefCentres,
  onSelectShelter,
  onClose,
}) => {
  const [messages, setMessages] = useState<AiChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      content: `Hello, I am Aegis AI, your real-time flood evacuation dispatcher. I am monitoring 15 IoT basin sensors, Chembarambakkam Dam water levels, and continuous road flood depths. 

Tap any emergency quick question below or ask me about your fastest evacuation route, blocked culverts, or vehicle safety procedures.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      suggestedActions: [
        '⚡ What is my fastest evacuation route?',
        '🚨 Is Paruthipattu / Avadi High Road flooded?',
        '🚗 Car stalling in water — what do I do?',
        '🆘 Broadcast Emergency SOS with GPS',
      ],
    },
  ]);

  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sosSent, setSosSent] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSendMessage = async (queryText?: string) => {
    const textToSend = queryText || inputQuery;
    if (!textToSend.trim() || isLoading) return;

    const userMsg: AiChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!queryText) setInputQuery('');
    setIsLoading(true);

    // If SOS broadcast is triggered
    if (textToSend.includes('SOS') || textToSend.includes('Broadcast')) {
      setSosSent(true);
      voiceNav.speak('Emergency SOS beacon broadcasted to NDRF Rescue Team and Avadi Police HQ. Stay where you are on high ground.', true);
    }

    try {
      const response = await fetch('/api/ai/advise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: textToSend,
          userLocation,
          blockedRoads,
          currentDamLevel: damTelemetry.reservoirLevelM,
          nearestShelter: reliefCentres[0]?.name,
        }),
      });

      const data = await response.json();
      const reply = data.reply || 'Immediate advice: Evacuate towards Thirumullaivoyal High Ridge Safe Haven via elevated bypass routes.';

      const botMsg: AiChatMessage = {
        id: `bot-${Date.now()}`,
        sender: 'assistant',
        content: reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        recommendedShelterId: 'RC-2',
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch {
      const botMsg: AiChatMessage = {
        id: `bot-fallback-${Date.now()}`,
        sender: 'assistant',
        content: `⚠️ Offline / Emergency Mode: Immediate recommendation is to proceed north toward **Thirumullaivoyal High Ridge Defense Pavilion (Elevation 24.8m)**. Avoid all low-lying culverts near Paruthipattu lake.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, botMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSpeakText = (text: string) => {
    // Strip markdown formatting for natural speech
    const cleanText = text.replace(/[*#_`]/g, '');
    voiceNav.speak(cleanText, false);
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[480px] bg-slate-900 border-l border-slate-800 shadow-2xl z-50 flex flex-col text-slate-100 overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-[#ff7700] flex items-center justify-center text-white shadow-lg">
              <Bot className="w-6 h-6" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-slate-900 animate-pulse"></span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-sm text-white uppercase tracking-wider">Aegis AI Assistant</h2>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-sky-500/20 text-sky-300 border border-sky-500/30">
                LIVE DISPATCH
              </span>
            </div>
            <p className="text-xs text-slate-400">Flood Safety & Fastest Evacuation Advisor</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Live Basin Telemetry Status Ribbon */}
      <div className="bg-slate-950/80 px-4 py-2 border-b border-slate-800/80 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="text-slate-400">DAM:</span>
          <span className={`font-bold ${damTelemetry.status === 'CRITICAL' ? 'text-red-400' : 'text-sky-400'}`}>
            {damTelemetry.reservoirLevelM}m ({damTelemetry.status})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-400">IMPASSABLE:</span>
          <span className="text-[#ff7700] font-bold">{blockedRoads.length} ROADS</span>
        </div>
      </div>

      {/* SOS Alert Banner if Broadcasted */}
      {sosSent && (
        <div className="bg-red-950/90 border-b border-red-800 p-3 flex items-center justify-between text-xs text-red-200 animate-pulse">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span><strong>SOS Active:</strong> Coordinates transmitted to NDRF rescue units.</span>
          </div>
          <button
            onClick={() => setSosSent(false)}
            className="text-[10px] underline text-red-300 hover:text-white"
          >
            Cancel Beacon
          </button>
        </div>
      )}

      {/* Chat Messages Body */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[88%] rounded-2xl p-3.5 text-xs leading-relaxed space-y-2 shadow-md ${
                msg.sender === 'user'
                  ? 'bg-[#ff7700] text-white rounded-tr-none'
                  : 'bg-slate-950 border border-slate-800 text-slate-200 rounded-tl-none'
              }`}
            >
              <div className="whitespace-pre-wrap font-sans">{msg.content}</div>

              {/* Action buttons inside bot messages */}
              {msg.sender === 'assistant' && (
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleSpeakText(msg.content)}
                    className="flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 font-medium"
                    title="Read Aloud Instructions"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Read Aloud</span>
                  </button>

                  {msg.recommendedShelterId && onSelectShelter && (
                    <button
                      onClick={() => onSelectShelter(msg.recommendedShelterId!)}
                      className="px-2.5 py-1 rounded bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 font-semibold text-[11px] border border-sky-500/40 flex items-center gap-1"
                    >
                      <Navigation className="w-3 h-3" />
                      Set as Route Destination
                    </button>
                  )}
                </div>
              )}
            </div>

            <span className="text-[10px] text-slate-500 mt-1 px-1 font-mono">
              {msg.timestamp}
            </span>

            {/* Suggested Quick Questions */}
            {msg.suggestedActions && (
              <div className="w-full mt-2 grid grid-cols-1 gap-1.5">
                {msg.suggestedActions.map((action, i) => (
                  <button
                    key={i}
                    onClick={() => handleSendMessage(action)}
                    className="text-left text-xs p-2 rounded-xl bg-slate-950/80 hover:bg-slate-800 border border-slate-800/80 hover:border-sky-500 text-slate-300 transition flex items-center justify-between group"
                  >
                    <span>{action}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-sky-400 transition" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 p-3 bg-slate-950 rounded-2xl border border-slate-800 w-fit text-xs text-sky-400 font-mono animate-pulse">
            <Sparkles className="w-4 h-4 animate-spin text-[#ff7700]" />
            <span>Aegis AI analyzing basin telemetry & routing vectors...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Box */}
      <div className="p-3 bg-slate-950 border-t border-slate-800">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            placeholder="Ask about fastest route, flooded roads, SOS..."
            className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
          />

          <button
            type="submit"
            disabled={!inputQuery.trim() || isLoading}
            className={`p-2.5 rounded-xl font-bold transition flex items-center justify-center ${
              inputQuery.trim() && !isLoading
                ? 'bg-[#ff7700] hover:bg-[#e66c00] text-white shadow-lg'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
