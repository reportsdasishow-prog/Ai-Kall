
import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  ChevronDownIcon,
  ChatBubbleLeftRightIcon,
  BriefcaseIcon,
  SparklesIcon,
  ChevronLeftIcon,
  ArrowRightIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/outline';

const LEVELS: EnglishLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const GOALS: LanguageGoal[] = ['English', 'Russian'];

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState('');
  
  // Auth Form states
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [level, setLevel] = useState<EnglishLevel>('B1');
  const [targetLanguage, setTargetLanguage] = useState<LanguageGoal>('English');

  // App States
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
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isProcessing]);

  useEffect(() => {
    const saved = localStorage.getItem('tutor_user');
    if (saved) {
      const user = JSON.parse(saved);
      setCurrentUser(user);
    }
  }, []);

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (!username || !password) {
      setAuthError('Please fill in all fields');
      return;
    }
    const users = JSON.parse(localStorage.getItem('tutor_users_db') || '{}');
    if (isRegistering) {
      if (users[username]) {
        setAuthError('User already exists');
        return;
      }
      const newUser: User = { username, level, targetLanguage };
      users[username] = { password, level, targetLanguage };
      localStorage.setItem('tutor_users_db', JSON.stringify(users));
      setCurrentUser(newUser);
      localStorage.setItem('tutor_user', JSON.stringify(newUser));
    } else {
      const stored = users[username];
      if (!stored || stored.password !== password) {
        setAuthError('Invalid username or password');
        return;
      }
      const existingUser: User = { username, level: stored.level, targetLanguage: stored.targetLanguage || 'English' };
      setCurrentUser(existingUser);
      localStorage.setItem('tutor_user', JSON.stringify(existingUser));
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('tutor_user');
    setCurrentUser(null);
    setMode('MENU');
    setMessages([]);
    setUsername('');
    setPassword('');
  };

  const startPractice = (selectedMode: PracticeMode, scenario: string = '') => {
    if (!currentUser) return;
    setMode(selectedMode);
    setMessages([]);
    tutorService.startSession(currentUser.level, currentUser.targetLanguage, selectedMode, scenario);
    const greetText = selectedMode === 'INTERVIEW' 
      ? `Hello ${currentUser.username}. I'm your interviewer today. Let's start.` 
      : `Hi! Ready to practice ${currentUser.targetLanguage}? What's on your mind?`;
    addMessage(Role.TUTOR, greetText);
  };

  const handleProfileUpdate = (updates: Partial<User>) => {
    if (currentUser) {
      const updatedUser = { ...currentUser, ...updates };
      setCurrentUser(updatedUser);
      localStorage.setItem('tutor_user', JSON.stringify(updatedUser));
      const users = JSON.parse(localStorage.getItem('tutor_users_db') || '{}');
      if (users[currentUser.username]) {
        users[currentUser.username] = { ...users[currentUser.username], ...updates };
        localStorage.setItem('tutor_users_db', JSON.stringify(users));
      }
      if (mode !== 'MENU') {
        tutorService.startSession(updatedUser.level, updatedUser.targetLanguage, mode, customScenarioInput);
      }
    }
  };

  const addMessage = (role: Role, text: string) => {
    const newMessage: Message = { id: Math.random().toString(36).substring(7), role, text, timestamp: new Date() };
    setMessages(prev => [...prev, newMessage]);
  };

  const playResponse = async (text: string) => {
    try {
      setIsPlaying(true);
      const base64Audio = await tutorService.getSpeech(text);
      if (!base64Audio) {
        setIsPlaying(false);
        return;
      }
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
      console.error("Audio playback error:", err);
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
      const response = await tutorService.sendMessage(userText);
      addMessage(Role.TUTOR, response);
      await playResponse(response);
    } catch (err) {
      addMessage(Role.TUTOR, "Sorry, I'm having trouble connecting to my brain.");
    } finally {
      setIsProcessing(false);
    }
  };

  const getSupportedMimeType = () => {
    const types = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav'];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedMimeType();
      
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/wav' });
        setIsProcessing(true);
        setProcessingStatus('Transcribing your voice...');
        
        try {
          const result = await tutorService.processAudio(audioBlob);
          
          // Improved parsing with multiple possible tags
          let transcription = "";
          let response = "";

          if (result.includes('[TRANSCRIPTION]') && result.includes('[RESPONSE]')) {
            const parts = result.split('[RESPONSE]');
            transcription = parts[0].replace('[TRANSCRIPTION]', '').trim();
            response = parts[1].trim();
          } else if (result.includes('[RESPONSE]')) {
             const parts = result.split('[RESPONSE]');
             transcription = parts[0].trim();
             response = parts[1].trim();
          } else {
            response = result;
            transcription = "Audio processed";
          }
          
          addMessage(Role.USER, transcription || "I heard something but couldn't transcribe it.");
          addMessage(Role.TUTOR, response);
          await playResponse(response);
        } catch (err: any) {
          console.error("STT Error:", err);
          addMessage(Role.TUTOR, "I couldn't hear you clearly. Error: " + err.message);
        } finally {
          setIsProcessing(false);
          setProcessingStatus('');
        }
      };

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Mic Access Denied:", err);
      alert("Please allow microphone access to use voice features.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-md p-8 rounded-2xl shadow-2xl space-y-6 border border-slate-200">
          <div className="text-center space-y-2">
            <div className="mx-auto bg-indigo-100 h-16 w-16 rounded-full flex items-center justify-center mb-4">
              <AcademicCapIcon className="h-10 w-10 text-indigo-600" />
            </div>
            <h2 className="text-3xl font-extrabold text-slate-900">AI Tutor</h2>
            <p className="text-slate-500">Master {targetLanguage} with AI</p>
          </div>
          <form onSubmit={handleAuth} className="space-y-4">
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none" placeholder="Username" />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none" placeholder="Password" />
            {isRegistering && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  {GOALS.map(g => (
                    <button key={g} type="button" onClick={() => setTargetLanguage(g)} className={`flex-1 py-2 text-sm font-semibold rounded-lg border ${targetLanguage === g ? 'bg-indigo-600 text-white' : 'bg-white'}`}>{g}</button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {LEVELS.map(l => (
                    <button key={l} type="button" onClick={() => setLevel(l)} className={`py-2 text-sm font-semibold rounded-lg border ${level === l ? 'bg-indigo-600 text-white' : 'bg-white'}`}>{l}</button>
                  ))}
                </div>
              </div>
            )}
            {authError && <p className="text-red-500 text-sm text-center">{authError}</p>}
            <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all">{isRegistering ? 'Sign Up' : 'Login'}</button>
          </form>
          <button onClick={() => setIsRegistering(!isRegistering)} className="w-full text-indigo-600 font-semibold text-sm">{isRegistering ? 'Login instead' : 'Create account'}</button>
        </div>
      </div>
    );
  }

  if (mode === 'MENU') {
    return (
      <div className="flex flex-col h-screen max-w-2xl mx-auto bg-slate-50 shadow-xl border-x border-slate-200">
        <header className="bg-indigo-600 px-6 py-6 text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
             <AcademicCapIcon className="h-8 w-8" />
             <div>
               <h1 className="text-xl font-bold">AI Language Coach</h1>
               <p className="text-xs text-indigo-100">{currentUser.username} • {currentUser.level}</p>
             </div>
          </div>
          <button onClick={handleLogout} className="p-2 hover:bg-white/10 rounded-full"><ArrowLeftOnRectangleIcon className="h-6 w-6" /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
           <div className="grid gap-4">
             <button onClick={() => startPractice('CONVERSATION')} className="flex items-center gap-4 p-5 bg-white rounded-2xl border border-slate-200 hover:border-indigo-400 transition-all text-left">
               <div className="bg-emerald-100 p-3 rounded-xl"><ChatBubbleLeftRightIcon className="h-8 w-8 text-emerald-600" /></div>
               <div className="flex-1">
                 <h3 className="font-bold">Simple Conversation</h3>
                 <p className="text-sm text-slate-500">Casual everyday talk.</p>
               </div>
               <ArrowRightIcon className="h-5 w-5 text-slate-300" />
             </button>
             <button onClick={() => startPractice('INTERVIEW')} className="flex items-center gap-4 p-5 bg-white rounded-2xl border border-slate-200 hover:border-indigo-400 transition-all text-left">
               <div className="bg-indigo-100 p-3 rounded-xl"><BriefcaseIcon className="h-8 w-8 text-indigo-600" /></div>
               <div className="flex-1">
                 <h3 className="font-bold">Job Interview</h3>
                 <p className="text-sm text-slate-500">Professional practice.</p>
               </div>
               <ArrowRightIcon className="h-5 w-5 text-slate-300" />
             </button>
           </div>
           <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100">
             <div className="flex items-center gap-2 mb-4"><SparklesIcon className="h-6 w-6 text-indigo-600" /><h2 className="font-bold">Custom Scenario</h2></div>
             <div className="flex gap-2">
               <input type="text" value={customScenarioInput} onChange={(e) => setCustomScenarioInput(e.target.value)} placeholder="e.g. At the airport" className="flex-1 px-4 py-3 rounded-xl border border-slate-200 outline-none" />
               <button onClick={() => startPractice('CUSTOM', customScenarioInput)} disabled={!customScenarioInput.trim()} className="bg-indigo-600 text-white px-5 py-3 rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50">Go</button>
             </div>
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto bg-white shadow-xl overflow-hidden border-x border-slate-100">
      <header className="bg-indigo-600 px-4 py-3 text-white flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => setMode('MENU')} className="p-1 hover:bg-white/10 rounded-full"><ChevronLeftIcon className="h-6 w-6" /></button>
          <div>
            <h1 className="text-sm font-bold leading-none">{mode === 'CUSTOM' ? customScenarioInput : mode}</h1>
            <p className="text-[10px] mt-1 opacity-80">{currentUser.targetLanguage} • {currentUser.level}</p>
          </div>
        </div>
        <button onClick={() => setMessages([])} className="p-2 hover:bg-white/10 rounded-full"><TrashIcon className="h-5 w-5" /></button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === Role.USER ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex flex-col ${msg.role === Role.USER ? 'items-end' : 'items-start'} max-w-[85%]`}>
              <div className={`rounded-2xl p-4 shadow-sm ${msg.role === Role.USER ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none'}`}>
                <p className="text-sm leading-relaxed">{msg.text}</p>
              </div>
              {msg.role === Role.TUTOR && !isPlaying && (
                <button onClick={() => playResponse(msg.text)} className="mt-1 text-[10px] font-bold text-indigo-500 hover:text-indigo-700 flex items-center gap-1 ml-2"><SpeakerWaveIcon className="h-3 w-3" /> Play</button>
              )}
            </div>
          </div>
        ))}
        {isProcessing && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-100 rounded-2xl p-4 flex flex-col gap-2 shadow-sm">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-75"></div>
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-150"></div>
              </div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{processingStatus}</p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white p-4 border-t border-slate-100 shrink-0">
        <div className="flex items-end gap-2 bg-slate-50 rounded-2xl p-2 border border-slate-200">
          <button
            onMouseDown={startRecording} onMouseUp={stopRecording} onTouchStart={startRecording} onTouchEnd={stopRecording}
            className={`p-3 rounded-xl transition-all shadow-md ${isRecording ? 'bg-red-500 text-white scale-110' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
          >
            <MicrophoneIcon className="h-6 w-6" />
          </button>
          <div className="flex-1 px-2 py-1 flex flex-col justify-center min-h-[44px]">
            {isRecording ? <VoiceIndicator isRecording={isRecording} /> : (
              <textarea value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendText())} placeholder="Type or hold microphone..." className="w-full bg-transparent border-none focus:ring-0 resize-none py-2 text-sm" rows={1} />
            )}
          </div>
          <button onClick={handleSendText} disabled={!inputText.trim() || isProcessing || isRecording} className="p-3 bg-indigo-100 text-indigo-700 rounded-xl disabled:opacity-30"><PaperAirplaneIcon className="h-6 w-6" /></button>
        </div>
      </div>
    </div>
  );
};

export default App;
