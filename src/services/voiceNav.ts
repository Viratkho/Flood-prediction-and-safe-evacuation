class VoiceNavService {
  private enabled = true;
  private audioCtx: AudioContext | null = null;
  private lastSpokenPhrase = '';
  private lastSpokenTime = 0;

  constructor() {
    // Audio context will be initialized on first user interaction
  }

  public setEnabled(val: boolean) {
    this.enabled = val;
    if (!val && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public playAlertChime(type: 'warning' | 'danger' | 'info' | 'success' = 'warning') {
    if (!this.enabled) return;
    try {
      if (!this.audioCtx) {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.audioCtx = new AudioContextClass();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      const now = this.audioCtx.currentTime;

      if (type === 'danger') {
        // High alert rapid two-tone beep
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(440, now + 0.15);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'warning') {
        // Warning alert tone
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.setValueAtTime(783.99, now + 0.12); // G5
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else {
        // Soft confirmation ping
        osc.frequency.setValueAtTime(523.25, now);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      }
    } catch {
      // AudioContext not allowed before user gesture
    }
  }

  public speak(phrase: string, urgent = false) {
    if (!this.enabled) return;
    if (!('speechSynthesis' in window)) return;

    const now = Date.now();
    // Prevent repetitive loops of the exact same message within 4 seconds
    if (this.lastSpokenPhrase === phrase && now - this.lastSpokenTime < 4000) {
      return;
    }

    this.lastSpokenPhrase = phrase;
    this.lastSpokenTime = now;

    if (urgent) {
      this.playAlertChime('danger');
      window.speechSynthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(phrase);
    utterance.rate = urgent ? 1.05 : 0.95;
    utterance.pitch = urgent ? 1.1 : 1.0;
    utterance.lang = 'en-US';

    const voices = window.speechSynthesis.getVoices();
    const naturalVoice = voices.find(
      (v) => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha'))
    );
    if (naturalVoice) {
      utterance.voice = naturalVoice;
    }

    window.speechSynthesis.speak(utterance);
  }
}

export const voiceNav = new VoiceNavService();
