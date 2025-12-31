
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
  UserCircleIcon,
  ChevronDownIcon,
  LanguageIcon,
  ChatBubbleLeftRightIcon,
  BriefcaseIcon,
  SparklesIcon,
  ChevronLeftIcon,
  ArrowRightIcon
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
  const [isPlaying, setIsPlaying] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Load user from local storage
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
      const existingUser: User = { 
        username, 
        level: stored.level, 
        targetLanguage: stored.targetLanguage || 'English' 
      };
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
    
    // Initial greeting
    const greetText = selectedMode === 'INTERVIEW' 
      ? `Hello ${currentUser.username}. Thank you for coming today. Let's begin the interview.` 
      : `Hi! Ready to practice some ${currentUser.targetLanguage}? What would you like to talk about?`;
    
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
      
      // If in a session, restart it
      if (mode !== 'MENU') {
        tutorService.startSession(updatedUser.level, updatedUser.targetLanguage, mode, customScenarioInput);
      }
    }
  };

  const addMessage = (role: Role, text: string) => {
    const newMessage: Message = {
      id: Math.random().toString(36).substring(7),
      role,
      text,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, newMessage]);
  };

  const playResponse = async (text: string) => {
    try {
      setIsPlaying(true);
      const base64Audio = await tutorService.getSpeech(text);
      if (!base64Audio) return;

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
    try {
      const response = await tutorService.sendMessage(userText);
      addMessage(Role.TUTOR, response);
      await playResponse(response);
    } catch (err) {
      console.error("Gemini Error:", err);
      addMessage(Role.TUTOR, "Sorry, I'm having trouble connecting right now.");
    } finally {
      setIsProcessing(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setIsProcessing(true);
        try {
          const result = await tutorService.processAudio(audioBlob);
          const parts = result.split('[RESPONSE]');
          const transcription = parts[0]?.trim() || "Unintelligible audio";
          const tutorResponse = parts[1]?.trim() || "I couldn't generate a response.";
          
          addMessage(Role.USER, transcription);
          addMessage(Role.TUTOR, tutorResponse);
          await playResponse(tutorResponse);
        } catch (err) {
          console.error("STT Error:", err);
        } finally {
          setIsProcessing(false);
        }
      };

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Mic Access Denied:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  // Auth Layout
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-md p-8 rounded-2xl shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto bg-indigo-100 h-16 w-16 rounded-full flex items-center justify-center mb-4">
              <AcademicCapIcon className="h-10 w-10 text-indigo-600" />
            </div>
            <h2 className="text-3xl font-extrabold text-slate-900">
              {isRegistering ? 'Join AI Tutor' : 'Welcome Back'}
            </h2>
            <p className="text-slate-500">Your path to fluency starts here.</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1 block w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                placeholder="language_learner"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                placeholder="••••••••"
              />
            </div>

            {isRegistering && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Target Language</label>
                  <div className="flex gap-2">
                    {GOALS.map(g => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setTargetLanguage(g)}
                        className={`flex-1 py-2 text-sm font-semibold rounded-lg border transition-all ${
                          targetLanguage === g 
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' 
                            : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Skill Level</label>
                  <div className="grid grid-cols-3 gap-2">
                    {LEVELS.map(l => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => setLevel(l)}
                        className={`py-2 text-sm font-semibold rounded-lg border transition-all ${
                          level === l 
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' 
                            : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {authError && <p className="text-red-500 text-sm font-medium animate-pulse">{authError}</p>}

            <button
              type="submit"
              className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all active:scale-95"
            >
              {isRegistering ? 'Start Learning' : 'Login'}
            </button>
          </form>

          <div className="text-center">
            <button
              onClick={() => {
                setIsRegistering(!isRegistering);
                setAuthError('');
              }}
              className="text-indigo-600 font-semibold hover:underline text-sm"
            >
              {isRegistering ? 'Already have an account? Login' : "Don't have an account? Register"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main Menu Layout
  if (mode === 'MENU') {
    return (
      <div className="flex flex-col h-screen max-w-2xl mx-auto bg-slate-50 shadow-xl font-sans">
        <header className="bg-indigo-600 px-6 py-6 text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
             <div className="bg-white/20 p-2 rounded-xl">
               <AcademicCapIcon className="h-8 w-8 text-white" />
             </div>
             <div>
               <h1 className="text-2xl font-bold tracking-tight">AI Language Coach</h1>
               <p className="text-xs text-indigo-100 font-medium">Hello, {currentUser.username} • {currentUser.targetLanguage} ({currentUser.level})</p>
             </div>
          </div>
          <button onClick={handleLogout} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <ArrowLeftOnRectangleIcon className="h-6 w-6" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
           <section>
             <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
               Choose your practice mode
             </h2>
             
             <div className="grid gap-4">
               {/* Mode Card: Conversation */}
               <button 
                 onClick={() => startPractice('CONVERSATION')}
                 className="flex items-center gap-4 p-5 bg-white rounded-2xl border border-slate-200 hover:border-indigo-400 hover:shadow-lg transition-all group text-left"
               >
                 <div className="bg-emerald-100 p-3 rounded-xl group-hover:scale-110 transition-transform">
                   <ChatBubbleLeftRightIcon className="h-8 w-8 text-emerald-600" />
                 </div>
                 <div className="flex-1">
                   <h3 className="font-bold text-slate-800">Simple Conversation</h3>
                   <p className="text-sm text-slate-500">Practice everyday talking about anything you like.</p>
                 </div>
                 <ArrowRightIcon className="h-5 w-5 text-slate-300 group-hover:text-indigo-500" />
               </button>

               {/* Mode Card: Interview */}
               <button 
                 onClick={() => startPractice('INTERVIEW')}
                 className="flex items-center gap-4 p-5 bg-white rounded-2xl border border-slate-200 hover:border-indigo-400 hover:shadow-lg transition-all group text-left"
               >
                 <div className="bg-indigo-100 p-3 rounded-xl group-hover:scale-110 transition-transform">
                   <BriefcaseIcon className="h-8 w-8 text-indigo-600" />
                 </div>
                 <div className="flex-1">
                   <h3 className="font-bold text-slate-800">Job Interview</h3>
                   <p className="text-sm text-slate-500">Simulate a professional interview with feedback.</p>
                 </div>
                 <ArrowRightIcon className="h-5 w-5 text-slate-300 group-hover:text-indigo-500" />
               </button>
             </div>
           </section>

           <section className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100">
             <div className="flex items-center gap-2 mb-4">
               <SparklesIcon className="h-6 w-6 text-indigo-600" />
               <h2 className="text-lg font-bold text-slate-800">Custom Scenario</h2>
             </div>
             <p className="text-sm text-slate-600 mb-4">Tell me where you are or what's happening (e.g. "At the pharmacy", "Booking a hotel")</p>
             <div className="flex gap-2">
               <input 
                 type="text" 
                 value={customScenarioInput}
                 onChange={(e) => setCustomScenarioInput(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && startPractice('CUSTOM', customScenarioInput)}
                 placeholder="Enter scenario name..."
                 className="flex-1 px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
               />
               <button 
                 onClick={() => startPractice('CUSTOM', customScenarioInput)}
                 disabled={!customScenarioInput.trim()}
                 className="bg-indigo-600 text-white px-5 py-3 rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
               >
                 Start
               </button>
             </div>
           </section>
        </div>

        <div className="p-6 text-center">
           <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
             Level Profile: {currentUser.level} Language: {currentUser.targetLanguage}
           </p>
        </div>
      </div>
    );
  }

  // Chat Interface Layout
  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto bg-white shadow-xl overflow-hidden font-sans border-x border-slate-100">
      {/* Header */}
      <header className="bg-indigo-600 px-4 py-3 text-white flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setMode('MENU')}
            className="p-1 hover:bg-white/10 rounded-full transition-colors mr-1"
            title="Back to Menu"
          >
            <ChevronLeftIcon className="h-6 w-6" />
          </button>
          <div>
            <h1 className="text-md font-bold leading-none">
              {mode === 'CONVERSATION' ? 'Chatting' : mode === 'INTERVIEW' ? 'Interview' : customScenarioInput}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[9px] font-bold uppercase tracking-wider bg-indigo-500 px-1 py-0.5 rounded">
                {currentUser.targetLanguage}
              </span>
              <div className="relative group">
                <button className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider bg-indigo-400 px-1 py-0.5 rounded">
                  {currentUser.level} <ChevronDownIcon className="h-2 w-2" />
                </button>
                <div className="absolute top-full left-0 mt-1 bg-white shadow-xl rounded-lg overflow-hidden hidden group-hover:block z-50 text-slate-800 border border-slate-100 min-w-[60px]">
                  {LEVELS.map(l => (
                    <button
                      key={l}
                      onClick={() => handleProfileUpdate({ level: l })}
                      className={`w-full px-3 py-1.5 text-left hover:bg-indigo-50 transition-colors text-xs font-semibold ${currentUser.level === l ? 'bg-indigo-100 text-indigo-700' : ''}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setMessages([])}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
            title="Reset Conversation"
          >
            <TrashIcon className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Chat area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 scroll-smooth"
      >
        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex ${msg.role === Role.USER ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`flex flex-col ${msg.role === Role.USER ? 'items-end' : 'items-start'} max-w-[85%]`}>
              <div 
                className={`rounded-2xl p-4 shadow-sm animate-in slide-in-from-bottom-2 duration-300 ${
                  msg.role === Role.USER 
                    ? 'bg-indigo-600 text-white rounded-tr-none' 
                    : 'bg-white text-slate-800 border border-slate-100 rounded-tl-none'
                }`}
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                <span className="text-[10px] mt-2 block opacity-60">
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              {msg.role === Role.TUTOR && !isPlaying && (
                <button 
                  onClick={() => playResponse(msg.text)}
                  className="mt-1 text-[10px] font-bold text-indigo-500 hover:text-indigo-700 flex items-center gap-1 ml-2"
                >
                  <SpeakerWaveIcon className="h-3 w-3" /> Play
                </button>
              )}
            </div>
          </div>
        ))}

        {isProcessing && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-100 rounded-2xl p-4 rounded-tl-none shadow-sm flex items-center space-x-2">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-75"></div>
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-150"></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="bg-white p-4 border-t border-slate-100 shrink-0 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
        <div className="flex items-end gap-2 bg-slate-50 rounded-2xl p-2 transition-all focus-within:ring-2 ring-indigo-300 ring-offset-1 border border-slate-200">
          <button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            className={`p-3 rounded-xl transition-all shadow-md active:shadow-none ${
              isRecording 
                ? 'bg-red-500 text-white scale-110' 
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            <MicrophoneIcon className="h-6 w-6" />
          </button>

          <div className="flex-1 px-2 py-1 flex flex-col justify-center min-h-[44px]">
            {isRecording ? (
              <div className="flex flex-col items-center py-2">
                <span className="text-[10px] uppercase font-bold text-red-500 mb-1 animate-pulse">Speak...</span>
                <VoiceIndicator isRecording={isRecording} />
              </div>
            ) : (
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendText())}
                placeholder={`Type in ${currentUser.targetLanguage}...`}
                className="w-full bg-transparent border-none focus:ring-0 resize-none max-h-32 py-2 text-slate-800 text-sm"
                rows={1}
              />
            )}
          </div>

          <button
            onClick={handleSendText}
            disabled={!inputText.trim() || isProcessing || isRecording}
            className={`p-3 rounded-xl transition-all ${
              !inputText.trim() || isProcessing || isRecording
                ? 'text-slate-400 cursor-not-allowed bg-slate-200'
                : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200 active:scale-95'
            }`}
          >
            <PaperAirplaneIcon className="h-6 w-6" />
          </button>
        </div>
        
        <div className="flex justify-between items-center mt-2 px-1">
          <p className="text-[10px] text-slate-400 font-medium">
            {isPlaying ? "Speaker active" : isRecording ? "Listening..." : `Mode: ${mode === 'CUSTOM' ? customScenarioInput : mode}`}
          </p>
        </div>
      </div>
    </div>
  );
};

export default App;
