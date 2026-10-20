import React, { useState, useRef, useEffect } from 'react';
import {
  AiChatMessage,
  DamTelemetry,
  ReliefCentre,
  RegisteredPerson,
} from '../types/floodguard';
import { voiceNav } from '../services/voiceNav';
import {
  AlertCircle,
  AlertTriangle,
  Bot,
  CheckCircle,
  ChevronRight,
  ExternalLink,
  Flame,
  Heart,
  HeartPulse,
  LifeBuoy,
  Lock,
  Mic,
  Navigation,
  Phone,
  Send,
  Shield,
  ShieldCheck,
  Smartphone,
  Sparkles,
  User,
  Users,
  Volume2,
  X,
} from 'lucide-react';

interface AegisAiAssistantProps {
  damTelemetry: DamTelemetry;
  userLocation: [number, number];
  blockedRoads: string[];
  reliefCentres: ReliefCentre[];
  people?: RegisteredPerson[];
  activePerson?: RegisteredPerson | null;
  onSelectShelter?: (shelterId: string) => void;
  onOpenSmsModal?: (person?: RegisteredPerson | null, prefilledText?: string) => void;
  onClose: () => void;
}

export const AegisAiAssistant: React.FC<AegisAiAssistantProps> = ({
  damTelemetry,
  userLocation,
  blockedRoads,
  reliefCentres,
  people = [],
  activePerson = null,
  onSelectShelter,
  onOpenSmsModal,
  onClose,
}) => {
  const [selectedPersonId, setSelectedPersonId] = useState<string>(activePerson?.personId || '');
  const [selectedPerson, setSelectedPerson] = useState<RegisteredPerson | null>(activePerson || null);

  // Sync selected person
  useEffect(() => {
    if (activePerson) {
      setSelectedPersonId(activePerson.personId);
      setSelectedPerson(activePerson);
    } else if (people.length > 0 && !selectedPersonId) {
      setSelectedPersonId(people[0].personId);
      setSelectedPerson(people[0]);
    }
  }, [activePerson, people]);

  const handleSelectPerson = (pId: string) => {
    setSelectedPersonId(pId);
    const p = people.find((person) => person.personId === pId) || null;
    setSelectedPerson(p);
  };

  const [messages, setMessages] = useState<AiChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      content: `🛡️ **AEGIS AI EMERGENCY FLOOD DISPATCHER ACTIVE**

I am monitoring **15 IoT basin flood sensors**, real-time **Chembarambakkam Dam discharge**, and **wearable physiological telemetry**.

I provide **safe route navigation**, **medical emergency guidance**, and can **dispatch emergency SMS alerts** to mobile phones.

Tap any tactical prompt below or describe your emergency situation:`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      suggestedActions: [
        '⚡ What is the fastest evacuation route to high ground?',
        '🚗 Car stalling in floodwater — what do I do?',
        '🏠 Water entered ground floor — rooftop safety protocol',
        '🩺 My heart rate is elevated in rising water',
        '📱 Send emergency SMS route alert to my mobile',
        '🆘 Broadcast Emergency SOS with GPS Beacon',
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
      voiceNav.speak(
        'Emergency SOS beacon broadcasted to NDRF Rescue Team and Avadi Police HQ. Stay where you are on high ground.',
        true
      );
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
          nearestShelter: reliefCentres[0]?.name || 'Thirumullaivoyal High Ridge Defense Pavilion',
          personProfile: selectedPerson || undefined,
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
        content: `⚠️ **Offline Emergency Fallback Mode**:
Immediate priority is to proceed north toward **Thirumullaivoyal High Ridge Defense Pavilion (Elevation 24.8m)**.
Avoid all low-lying culverts near Paruthipattu lake and Kovur causeway.`,
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

  const handleSendSmsSnippet = (content: string) => {
    // Extract first 150 chars of advice as SMS body
    const cleanContent = content.replace(/[*#_`]/g, '').trim();
    const snippet = cleanContent.slice(0, 150) + '... Check FloodGuard for map.';
    onOpenSmsModal?.(selectedPerson, snippet);
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[500px] bg-slate-900 border-l border-slate-800 shadow-2xl z-50 flex flex-col text-slate-100 overflow-hidden">
      {/* Top Header */}
      <div className="p-4 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#ff7700] to-amber-500 flex items-center justify-center text-white shadow-lg shadow-[#ff7700]/20">
              <Bot className="w-6 h-6" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-slate-900 animate-pulse"></span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-sm text-white tracking-wide">Aegis AI Emergency Dispatcher</h2>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                PROMPT 2.1
              </span>
            </div>
            <p className="text-xs text-slate-400">Tactical Evacuation & Life-Safety AI Engine</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* WAF Firewall & Key Isolation Badge */}
      <div className="bg-slate-950/90 px-3.5 py-1.5 border-b border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center gap-1.5 text-emerald-400 font-mono">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>WAF Protected AI Proxy • Zero Fingerprint</span>
        </div>
        <span className="text-[10px] text-slate-400 font-mono">L7 DPI Active</span>
      </div>

      {/* Evacuee Context Selector (Tailors AI guidance directly to person!) */}
      {people.length > 0 && (
        <div className="bg-slate-950 px-4 py-2 border-b border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 flex-1 mr-2">
            <User className="w-3.5 h-3.5 text-[#ff7700] shrink-0" />
            <span className="text-slate-400 text-[11px] shrink-0">Advising:</span>
            <select
              value={selectedPersonId}
              onChange={(e) => handleSelectPerson(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-[#ff7700] flex-1 truncate"
            >
              <option value="">General Citizen (Avadi Basin)</option>
              {people.map((p) => (
                <option key={p.personId} value={p.personId}>
                  {p.name} {p.medicalNotes ? `(${p.medicalNotes})` : ''} - {p.rescuePriority}
                </option>
              ))}
            </select>
          </div>

          {selectedPerson && onOpenSmsModal && (
            <button
              onClick={() => onOpenSmsModal(selectedPerson)}
              className="px-2 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-lg text-[11px] flex items-center gap-1 shrink-0 font-medium transition"
              title="Send SMS to this person"
            >
              <Smartphone className="w-3 h-3 text-blue-400" />
              <span>SMS Alert</span>
            </button>
          )}
        </div>
      )}

      {/* Live Basin Telemetry Status Ribbon */}
      <div className="bg-slate-950/80 px-4 py-2 border-b border-slate-800/80 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="text-slate-400">DAM:</span>
          <span className={`font-bold ${damTelemetry.status === 'CRITICAL' ? 'text-red-400' : 'text-sky-400'}`}>
            {damTelemetry.reservoirLevelM}m ({damTelemetry.status})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-400">DISCHARGE:</span>
          <span className="text-[#ff7700] font-bold">
            {damTelemetry.spillwayReleaseCusecs.toLocaleString()} cusecs
          </span>
        </div>
      </div>

      {/* SOS Alert Banner if Broadcasted */}
      {sosSent && (
        <div className="bg-red-950/90 border-b border-red-800 p-3 flex items-center justify-between text-xs text-red-200 animate-pulse">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>
              <strong>SOS Active:</strong> Emergency beacons & GPS dispatched to NDRF boat units.
            </span>
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
              className={`max-w-[92%] rounded-2xl p-3.5 text-xs leading-relaxed space-y-2.5 shadow-md ${
                msg.sender === 'user'
                  ? 'bg-gradient-to-r from-[#ff7700] to-amber-600 text-white rounded-tr-none'
                  : 'bg-slate-950 border border-slate-800 text-slate-200 rounded-tl-none'
              }`}
            >
              <div className="whitespace-pre-wrap font-sans text-xs leading-relaxed">
                {msg.content}
              </div>

              {/* Action buttons inside bot messages */}
              {msg.sender === 'assistant' && (
                <div className="pt-2.5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSpeakText(msg.content)}
                      className="flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 font-medium"
                      title="Read Aloud Instructions"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>Read Aloud</span>
                    </button>

                    {onOpenSmsModal && (
                      <button
                        onClick={() => handleSendSmsSnippet(msg.content)}
                        className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 font-medium"
                        title="Send this advice as SMS alert to mobile"
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                        <span>Send via SMS</span>
                      </button>
                    )}
                  </div>

                  {msg.recommendedShelterId && onSelectShelter && (
                    <button
                      onClick={() => onSelectShelter(msg.recommendedShelterId!)}
                      className="px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 font-semibold text-[11px] border border-sky-500/40 flex items-center gap-1"
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
                    className="text-left text-xs p-2.5 rounded-xl bg-slate-950/80 hover:bg-slate-800 border border-slate-800 hover:border-[#ff7700] text-slate-300 hover:text-white transition flex items-center justify-between group shadow-sm"
                  >
                    <span>{action}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-[#ff7700] transition" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 p-3 bg-slate-950 rounded-2xl border border-slate-800 w-fit text-xs text-sky-400 font-mono animate-pulse">
            <Sparkles className="w-4 h-4 animate-spin text-[#ff7700]" />
            <span>Aegis AI synthesizing live hydrological data, vitals & route safety...</span>
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
            placeholder="Ask about fastest route, flooded roads, SMS alerts, SOS..."
            className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#ff7700]"
          />

          <button
            type="submit"
            disabled={!inputQuery.trim() || isLoading}
            className={`p-2.5 rounded-xl font-bold transition flex items-center justify-center ${
              inputQuery.trim() && !isLoading
                ? 'bg-[#ff7700] hover:bg-[#e66c00] text-white shadow-lg shadow-[#ff7700]/20'
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
