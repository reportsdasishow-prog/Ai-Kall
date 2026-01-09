
import React, { useState, useRef, useEffect } from 'react';
import { tutorService } from './services/geminiService';
import { decode, decodeAudioData } from './services/audioService';
import { Message, Role, User, EnglishLevel, LanguageGoal, PracticeMode } from './types';
import { VoiceIndicator } from './components/VoiceIndicator';
import { 
  MicrophoneIcon, 
  PaperAirplaneIcon, 
  SpeakerWaveIcon,
  AcademicCapIcon,
  TrashIcon,
  ArrowLeftOnRectangleIcon,
  ChatBubbleLeftRightIcon,
  BriefcaseIcon,
  SparklesIcon,
  ChevronLeftIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';

const LEVELS: EnglishLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const GOALS: LanguageGoal[] = ['English', 'Russian'];

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState('');
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [level, setLevel] = useState<EnglishLevel>('B1');
  const [targetLanguage, setTargetLanguage] = useState<LanguageGoal>('English');

  const [mode, setMode] = useState<PracticeMode>('MENU');
  const [customScenarioInput, setCustomScenarioInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('tutor_user');
    if (saved) setCurrentUser(JSON.parse(saved));
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isProcessing]);

  const handleError = (err: any) => {
    console.error("Application Error:", err);
    const errorMsg = err?.message || String(err);
    addMessage(Role.TUTOR, `I encountered an error: ${errorMsg}. Please ensure you have a valid internet connection.`);
  };

  const addMessage = (role: Role, text: string) => {
    setMessages(prev => [...prev, { id: Math.random().toString(36).substring(7), role, text, timestamp: new Date() }]);
  };

  const cleanResponse = (text: string) => {
    // Helper to strip tags if they appear
    if (text.includes('[RESPONSE]')) {
      return text.split('[RESPONSE]')[1].trim();
    }
    return text.replace(/\[TRANSCRIPTION\]|\[RESPONSE\]/g, '').trim();
  };

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return setAuthError('Please fill in all fields');
    const users = JSON.parse(localStorage.getItem('tutor_users_db') || '{}');
    if (isRegistering) {
      if (users[username]) return setAuthError('Username already exists');
      const newUser: User = { username, level, targetLanguage };
      users[username] = { password, level, targetLanguage };
      localStorage.setItem('tutor_users_db', JSON.stringify(users));
      setCurrentUser(newUser);
      localStorage.setItem('tutor_user', JSON.stringify(newUser));
    } else {
      const stored = users[username];
      if (!stored || stored.password !== password) return setAuthError('Invalid credentials');
      const user: User = { username, level: stored.level, targetLanguage: stored.targetLanguage };
      setCurrentUser(user);
      localStorage.setItem('tutor_user', JSON.stringify(user));
    }
  };

  const startPractice = (selectedMode: PracticeMode, scenario: string = '') => {
    if (!currentUser) return;
    setMode(selectedMode);
    setMessages([]);
    tutorService.startSession(currentUser.level, currentUser.targetLanguage, selectedMode, scenario);
    addMessage(Role.TUTOR, `Welcome to your ${selectedMode.toLowerCase()} practice! I am ready to listen. You can speak or type.`);
  };

  const playResponse = async (text: string) => {
    try {
      setIsPlaying(true);
      const base64Audio = await tutorService.getSpeech(text);
      if (!base64Audio) return setIsPlaying(false);
      
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      const ctx = audioContextRef.current;
      const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => setIsPlaying(false);
      source.start();
    } catch (err) {
      console.error("Playback error:", err);
      setIsPlaying(false);
    }
  };

  const handleSendText = async () => {
    if (!inputText.trim() || isProcessing) return;

    const userText = inputText;
    setInputText('');
    addMessage(Role.USER, userText);
    setIsProcessing(true);
    setProcessingStatus('Thinking...');
    
    try {
      const rawResult = await tutorService.sendMessage(userText);
      const result = cleanResponse(rawResult);
      addMessage(Role.TUTOR, result);
      await playResponse(result);
    } catch (err) {
      handleError(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        if (audioBlob.size < 50) { // Tiny threshold for noise
          setIsProcessing(false);
          return;
        }

        setIsProcessing(true);
        setProcessingStatus('AI is listening...');
        
        try {
          const result = await tutorService.processAudio(audioBlob);
          let trans = "Audio message";
          let resp = result;

          if (result.includes('[RESPONSE]')) {
            const parts = result.split('[RESPONSE]');
            trans = parts[0].replace('[TRANSCRIPTION]', '').trim();
            resp = parts[1].trim();
          } else {
            // Fallback cleanup if strict format failed
            resp = cleanResponse(result);
          }

          addMessage(Role.USER, trans);
          addMessage(Role.TUTOR, resp);
          await playResponse(resp);
        } catch (err) {
          handleError(err);
        } finally {
          setIsProcessing(false);
        }
      };

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      alert("Microphone access is required for voice practice.");
      console.error(err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-md p-8 rounded-2xl shadow-xl space-y-6">
          <div className="text-center">
            <AcademicCapIcon className="h-12 w-12 text-indigo-600 mx-auto" />
            <h2 className="text-2xl font-bold mt-2">Personal AI Tutor</h2>
            <p className="text-slate-500 text-sm">Choose your language goals</p>
          </div>
          <form onSubmit={handleAuth} className="space-y-4">
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Username" />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Password" />
            {isRegistering && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  {GOALS.map(g => (
                    <button key={g} type="button" onClick={() => setTargetLanguage(g)} className={`flex-1 p-2 rounded-lg text-xs font-bold border transition-all ${targetLanguage === g ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200'}`}>{g}</button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {LEVELS.map(l => (
                    <button key={l} type="button" onClick={() => setLevel(l)} className={`p-2 rounded-lg text-xs font-bold border transition-all ${level === l ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200'}`}>{l}</button>
                  ))}
                </div>
              </div>
            )}
            {authError && <p className="text-red-500 text-xs text-center font-medium">{authError}</p>}
            <button type="submit" className="w-full bg-indigo-600 text-white p-4 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg">
              {isRegistering ? 'Create Account' : 'Sign In'}
            </button>
          </form>
          <button onClick={() => setIsRegistering(!isRegistering)} className="w-full text-indigo-600 text-sm font-semibold hover:underline">
            {isRegistering ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'MENU') {
    return (
      <div className="h-screen bg-slate-50 flex flex-col max-w-2xl mx-auto shadow-2xl">
        <header className="bg-indigo-600 p-6 text-white flex justify-between items-center shadow-lg">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-xl"><AcademicCapIcon className="h-6 w-6" /></div>
            <div>
              <h1 className="text-xl font-bold leading-tight">{currentUser.username}</h1>
              <p className="text-xs opacity-80 font-medium">Target: {currentUser.targetLanguage} • Level {currentUser.level}</p>
            </div>
          </div>
          <button onClick={() => { localStorage.removeItem('tutor_user'); setCurrentUser(null); }} className="p-2 hover:bg-white/10 rounded-full transition-colors"><ArrowLeftOnRectangleIcon className="h-5 w-5" /></button>
        </header>
        <div className="flex-1 p-6 space-y-6 overflow-y-auto">
          <div className="grid gap-4">
            <button onClick={() => startPractice('CONVERSATION')} className="group w-full p-6 bg-white border border-slate-200 rounded-2xl flex items-center gap-5 hover:border-indigo-400 hover:shadow-md transition-all text-left">
              <div className="bg-emerald-100 p-4 rounded-2xl group-hover:bg-emerald-200 transition-colors"><ChatBubbleLeftRightIcon className="h-8 w-8 text-emerald-600" /></div>
              <div className="flex-1">
                <h3 className="font-bold text-lg text-slate-800">Casual Conversation</h3>
                <p className="text-sm text-slate-500">Practice everyday topics and build fluency.</p>
              </div>
              <ArrowRightIcon className="h-5 w-5 text-slate-300 group-hover:text-indigo-500 transition-colors" />
            </button>
            <button onClick={() => startPractice('INTERVIEW')} className="group w-full p-6 bg-white border border-slate-200 rounded-2xl flex items-center gap-5 hover:border-indigo-400 hover:shadow-md transition-all text-left">
              <div className="bg-indigo-100 p-4 rounded-2xl group-hover:bg-indigo-200 transition-colors"><BriefcaseIcon className="h-8 w-8 text-indigo-600" /></div>
              <div className="flex-1">
                <h3 className="font-bold text-lg text-slate-800">Job Interview</h3>
                <p className="text-sm text-slate-500">Prepare for professional roles with realistic questions.</p>
              </div>
              <ArrowRightIcon className="h-5 w-5 text-slate-300 group-hover:text-indigo-500 transition-colors" />
            </button>
          </div>
          <div className="bg-gradient-to-br from-indigo-50 to-white p-6 rounded-3xl border border-indigo-100 shadow-sm space-y-4">
             <div className="flex items-center gap-2"><SparklesIcon className="h-6 w-6 text-indigo-600" /><h3 className="font-bold text-indigo-900">Custom Scenario</h3></div>
             <p className="text-xs text-indigo-700 font-medium">Create your own situation (e.g., "At a high-end restaurant", "Ordering a coffee").</p>
             <div className="flex gap-2">
               <input type="text" value={customScenarioInput} onChange={e => setCustomScenarioInput(e.target.value)} className="flex-1 p-4 rounded-2xl border border-indigo-200 outline-none focus:ring-2 focus:ring-indigo-500 bg-white" placeholder="Where do you want to be?" />
               <button onClick={() => startPractice('CUSTOM', customScenarioInput)} disabled={!customScenarioInput.trim()} className="bg-indigo-600 text-white px-6 rounded-2xl font-bold hover:bg-indigo-700 disabled:opacity-50 shadow-lg transition-all active:scale-95">Start</button>
             </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col max-w-2xl mx-auto bg-white shadow-2xl overflow-hidden relative">
      <header className="bg-indigo-600 p-4 text-white flex items-center justify-between shadow-md z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => setMode('MENU')} className="p-2 hover:bg-white/10 rounded-xl transition-colors"><ChevronLeftIcon className="h-6 w-6 font-bold" /></button>
          <div>
            <h1 className="font-bold text-sm leading-none uppercase tracking-wider">{mode === 'CUSTOM' ? customScenarioInput : mode}</h1>
            <p className="text-[10px] mt-1 opacity-70 font-bold">{currentUser.targetLanguage} • {currentUser.level}</p>
          </div>
        </div>
        <button onClick={() => setMessages([])} className="p-2 hover:bg-white/10 rounded-xl transition-colors" title="Clear Chat"><TrashIcon className="h-5 w-5" /></button>
      </header>
      
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 scroll-smooth">
        {messages.length === 0 && !isProcessing && (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2 opacity-50 text-center">
            <ChatBubbleLeftRightIcon className="h-12 w-12" />
            <p className="text-sm font-medium">Hold the microphone button to speak,<br/>or type your message below.</p>
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} className={`flex ${m.role === Role.USER ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
            <div className={`max-w-[85%] p-4 rounded-2xl shadow-sm ${m.role === Role.USER ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'}`}>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.text}</p>
              {m.role === Role.TUTOR && !isPlaying && (
                <button onClick={() => playResponse(m.text)} className="mt-3 flex items-center gap-1.5 text-[10px] font-extrabold text-indigo-600 uppercase tracking-widest hover:text-indigo-800 transition-colors">
                  <SpeakerWaveIcon className="h-3.5 w-3.5" /> Speak
                </button>
              )}
            </div>
          </div>
        ))}
        {isProcessing && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-2 shadow-sm min-w-[120px]">
              <div className="flex space-x-1.5">
                <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
              </div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{processingStatus}</p>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t bg-white shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div className={`flex items-end gap-3 p-3 rounded-2xl transition-all duration-300 border ${isRecording ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200 focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100'}`}>
          <button 
            onMouseDown={startRecording} 
            onMouseUp={stopRecording} 
            onTouchStart={startRecording} 
            onTouchEnd={stopRecording} 
            className={`p-4 rounded-2xl transition-all shadow-lg ${isRecording ? 'bg-red-500 scale-110 pulse-ring' : 'bg-indigo-600 hover:bg-indigo-700 active:scale-95'}`}
            title="Hold to speak"
          >
            <MicrophoneIcon className="h-6 w-6 text-white" />
          </button>
          
          <div className="flex-1 min-h-[50px] flex items-center px-2">
            {isRecording ? (
              <div className="flex-1 flex items-center justify-between">
                <VoiceIndicator isRecording={isRecording} />
                <span className="text-[10px] font-bold text-red-500 uppercase tracking-tighter animate-pulse">Recording...</span>
              </div>
            ) : (
              <textarea 
                value={inputText} 
                onChange={e => setInputText(e.target.value)} 
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendText())} 
                className="w-full bg-transparent border-none focus:ring-0 resize-none text-sm py-2 max-h-32 text-slate-800 placeholder-slate-400 font-medium" 
                placeholder="Type or hold mic to speak..." 
                rows={1} 
              />
            )}
          </div>
          
          <button 
            onClick={handleSendText} 
            disabled={!inputText.trim() || isProcessing || isRecording} 
            className="p-4 text-indigo-600 hover:bg-indigo-50 rounded-2xl disabled:opacity-20 transition-all active:scale-90"
          >
            <PaperAirplaneIcon className="h-6 w-6" />
          </button>
        </div>
      </div>
      
      <style>{`
        .pulse-ring {
          box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
          animation: pulse 1.5s infinite cubic-bezier(0.66, 0, 0, 1);
        }
        @keyframes pulse {
          to {
            box-shadow: 0 0 0 15px rgba(239, 68, 68, 0);
          }
        }
      `}</style>
    </div>
  );
};

export default App;
