
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
  ExclamationTriangleIcon
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
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isProcessing]);

  useEffect(() => {
    const saved = localStorage.getItem('tutor_user');
    if (saved) setCurrentUser(JSON.parse(saved));
  }, []);

  const addMessage = (role: Role, text: string) => {
    setMessages(prev => [...prev, { id: Math.random().toString(36).substring(7), role, text, timestamp: new Date() }]);
  };

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return setAuthError('Fill all fields');
    const users = JSON.parse(localStorage.getItem('tutor_users_db') || '{}');
    if (isRegistering) {
      if (users[username]) return setAuthError('User exists');
      const newUser = { username, level, targetLanguage };
      users[username] = { password, level, targetLanguage };
      localStorage.setItem('tutor_users_db', JSON.stringify(users));
      setCurrentUser(newUser);
      localStorage.setItem('tutor_user', JSON.stringify(newUser));
    } else {
      const stored = users[username];
      if (!stored || stored.password !== password) return setAuthError('Wrong credentials');
      const user = { username, level: stored.level, targetLanguage: stored.targetLanguage };
      setCurrentUser(user);
      localStorage.setItem('tutor_user', JSON.stringify(user));
    }
  };

  const startPractice = (selectedMode: PracticeMode, scenario: string = '') => {
    if (!currentUser) return;
    setMode(selectedMode);
    setMessages([]);
    tutorService.startSession(currentUser.level, currentUser.targetLanguage, selectedMode, scenario);
    addMessage(Role.TUTOR, `Ready to practice ${currentUser.targetLanguage}! How can I help you today?`);
  };

  const playResponse = async (text: string) => {
    try {
      setIsPlaying(true);
      const base64Audio = await tutorService.getSpeech(text);
      if (!base64Audio) return setIsPlaying(false);
      if (!audioContextRef.current) audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      const ctx = audioContextRef.current;
      const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => setIsPlaying(false);
      source.start();
    } catch (err) {
      console.error(err);
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
    } catch (err: any) {
      addMessage(Role.TUTOR, `Error: ${err.message}. Check your API Key.`);
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
      recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        setIsProcessing(true);
        setProcessingStatus('AI is listening...');
        try {
          const result = await tutorService.processAudio(audioBlob);
          let trans = result, resp = result;
          if (result.includes('[RESPONSE]')) {
            const parts = result.split('[RESPONSE]');
            trans = parts[0].replace('[TRANSCRIPTION]', '').trim();
            resp = parts[1].trim();
          }
          addMessage(Role.USER, trans || "Audio input");
          addMessage(Role.TUTOR, resp);
          await playResponse(resp);
        } catch (err: any) {
          addMessage(Role.TUTOR, `Mic Error: ${err.message}`);
        } finally {
          setIsProcessing(false);
        }
      };
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      alert("Mic blocked. Allow it in browser settings.");
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
            <h2 className="text-2xl font-bold mt-2">AI English Tutor</h2>
          </div>
          <form onSubmit={handleAuth} className="space-y-4">
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} className="w-full p-3 border rounded-xl" placeholder="Username" />
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3 border rounded-xl" placeholder="Password" />
            {isRegistering && (
              <div className="grid grid-cols-3 gap-2">
                {LEVELS.map(l => <button key={l} type="button" onClick={() => setLevel(l)} className={`p-2 rounded border text-xs ${level === l ? 'bg-indigo-600 text-white' : ''}`}>{l}</button>)}
              </div>
            )}
            {authError && <p className="text-red-500 text-xs text-center">{authError}</p>}
            <button type="submit" className="w-full bg-indigo-600 text-white p-3 rounded-xl font-bold">
              {isRegistering ? 'Sign Up' : 'Login'}
            </button>
          </form>
          <button onClick={() => setIsRegistering(!isRegistering)} className="w-full text-indigo-600 text-sm">
            {isRegistering ? 'Login instead' : 'Create account'}
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'MENU') {
    return (
      <div className="h-screen bg-slate-50 flex flex-col max-w-2xl mx-auto shadow-xl">
        <header className="bg-indigo-600 p-6 text-white flex justify-between items-center">
          <div><h1 className="text-xl font-bold">Hi, {currentUser.username}</h1><p className="text-xs opacity-80">{currentUser.level} Level</p></div>
          <button onClick={() => { localStorage.removeItem('tutor_user'); setCurrentUser(null); }} className="p-2 bg-white/10 rounded-full"><ArrowLeftOnRectangleIcon className="h-5 w-5" /></button>
        </header>
        <div className="p-6 space-y-4">
          <button onClick={() => startPractice('CONVERSATION')} className="w-full p-6 bg-white border rounded-2xl flex items-center gap-4 hover:border-indigo-400">
            <ChatBubbleLeftRightIcon className="h-8 w-8 text-indigo-600" />
            <div className="text-left"><h3 className="font-bold">Conversation</h3><p className="text-xs text-slate-500">Free talk practice</p></div>
          </button>
          <button onClick={() => startPractice('INTERVIEW')} className="w-full p-6 bg-white border rounded-2xl flex items-center gap-4 hover:border-indigo-400">
            <BriefcaseIcon className="h-8 w-8 text-indigo-600" />
            <div className="text-left"><h3 className="font-bold">Interview</h3><p className="text-xs text-slate-500">Job prep mode</p></div>
          </button>
          <div className="bg-indigo-50 p-6 rounded-2xl space-y-3">
             <div className="flex items-center gap-2"><SparklesIcon className="h-5 w-5 text-indigo-600" /><h3 className="font-bold">Custom Topic</h3></div>
             <div className="flex gap-2">
               <input type="text" value={customScenarioInput} onChange={e => setCustomScenarioInput(e.target.value)} className="flex-1 p-3 rounded-xl border" placeholder="e.g. Booking a hotel" />
               <button onClick={() => startPractice('CUSTOM', customScenarioInput)} className="bg-indigo-600 text-white px-4 rounded-xl">Go</button>
             </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col max-w-2xl mx-auto bg-white shadow-2xl overflow-hidden">
      <header className="bg-indigo-600 p-3 text-white flex items-center gap-3">
        <button onClick={() => setMode('MENU')} className="p-1 hover:bg-white/10 rounded-full"><ChevronLeftIcon className="h-6 w-6" /></button>
        <h1 className="font-bold">{mode} Mode</h1>
      </header>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
        {messages.map(m => (
          <div key={m.id} className={`flex ${m.role === Role.USER ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-3 rounded-2xl ${m.role === Role.USER ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white border rounded-tl-none shadow-sm'}`}>
              <p className="text-sm">{m.text}</p>
              {m.role === Role.TUTOR && !isPlaying && <button onClick={() => playResponse(m.text)} className="mt-2 text-[10px] flex items-center gap-1 text-indigo-500 font-bold"><SpeakerWaveIcon className="h-3 w-3"/> Play Audio</button>}
            </div>
          </div>
        ))}
        {isProcessing && (
          <div className="flex items-center gap-2 text-slate-400 text-xs animate-pulse">
            <div className="flex gap-1"><div className="w-1.5 h-1.5 bg-slate-300 rounded-full"></div><div className="w-1.5 h-1.5 bg-slate-300 rounded-full delay-75"></div></div>
            {processingStatus}
          </div>
        )}
      </div>
      <div className="p-4 border-t bg-white">
        <div className="flex items-end gap-2 p-2 bg-slate-100 rounded-2xl">
          <button onMouseDown={startRecording} onMouseUp={stopRecording} onTouchStart={startRecording} onTouchEnd={stopRecording} className={`p-3 rounded-xl transition-all ${isRecording ? 'bg-red-500 scale-110' : 'bg-indigo-600'} text-white`}>
            <MicrophoneIcon className="h-6 w-6" />
          </button>
          <div className="flex-1 min-h-[44px] flex items-center px-2">
            {isRecording ? <VoiceIndicator isRecording={isRecording} /> : <textarea value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendText()} className="w-full bg-transparent border-none focus:ring-0 resize-none text-sm" placeholder="Hold mic to speak or type..." rows={1} />}
          </div>
          <button onClick={handleSendText} disabled={!inputText.trim()} className="p-3 text-indigo-600 disabled:opacity-30"><PaperAirplaneIcon className="h-6 w-6" /></button>
        </div>
      </div>
    </div>
  );
};

export default App;
