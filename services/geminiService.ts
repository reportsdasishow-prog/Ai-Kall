
import { GoogleGenAI, Modality, GenerateContentResponse } from "@google/genai";
import { blobToBase64 } from "./audioService";
import { EnglishLevel, LanguageGoal, PracticeMode } from "../types";

const API_KEY = process.env.API_KEY || "";

export class GeminiTutorService {
  private ai: GoogleGenAI;
  private chat: any;
  private currentLevel: EnglishLevel = 'B1';
  private targetLanguage: LanguageGoal = 'English';
  private currentMode: PracticeMode = 'MENU';
  private customScenario: string = '';

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: API_KEY });
  }

  private initChat() {
    const levelDescriptions: Record<EnglishLevel, string> = {
      'A1': 'Beginner. Use very simple words and short sentences.',
      'A2': 'Elementary. Use simple language but start introducing basic past and future tenses.',
      'B1': 'Intermediate. Use standard language. Focus on common expressions.',
      'B2': 'Upper Intermediate. Use a rich vocabulary. Engage in deeper discussions.',
      'C1': 'Advanced. Use sophisticated vocabulary and complex grammar.',
      'C2': 'Proficiency. Speak naturally as a native professional would.'
    };

    const tutorLang = this.targetLanguage === 'English' ? 'English' : 'Russian';
    
    let modeInstruction = '';
    switch(this.currentMode) {
      case 'CONVERSATION':
        modeInstruction = `Context: A casual everyday conversation. Be friendly and informal.`;
        break;
      case 'INTERVIEW':
        modeInstruction = `Context: A formal job interview. You are a professional recruiter/hiring manager. Ask challenging interview questions.`;
        break;
      case 'CUSTOM':
        modeInstruction = `Context: ${this.customScenario}. Adopt this persona/scenario strictly.`;
        break;
      default:
        modeInstruction = `Context: General practice.`;
    }

    const instructions = `You are a friendly and professional ${tutorLang} Tutor. 
    Current Student Level: ${this.currentLevel}. ${levelDescriptions[this.currentLevel]}
    ${modeInstruction}
    
    Your goals:
    1. Listen to the user's spoken or written ${tutorLang}.
    2. Politely correct any grammatical errors or awkward phrasing relative to their level.
    3. Maintain an encouraging conversation based on the context provided.
    4. Keep your responses short (2-3 sentences max) so they are suitable for voice playback.
    5. If the user makes a mistake, explain it briefly in ${tutorLang}.
    
    Output format: Provide your response in plain text. Do not use complex markdown.`;

    this.chat = this.ai.chats.create({
      model: 'gemini-3-flash-preview',
      config: {
        systemInstruction: instructions,
      },
    });
  }

  startSession(level: EnglishLevel, targetLanguage: LanguageGoal, mode: PracticeMode, scenario: string = '') {
    this.currentLevel = level;
    this.targetLanguage = targetLanguage;
    this.currentMode = mode;
    this.customScenario = scenario;
    this.initChat();
  }

  async processAudio(audioBlob: Blob): Promise<string> {
    const base64Audio = await blobToBase64(audioBlob);
    const tutorLang = this.targetLanguage === 'English' ? 'English' : 'Russian';
    
    const response = await this.ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: audioBlob.type,
              data: base64Audio,
            },
          },
          { text: `Transcribe exactly what I said in ${tutorLang}, and then respond as my ${tutorLang} tutor. Separate your transcription from your response with a marker [RESPONSE].` }
        ],
      },
    });

    return response.text || "";
  }

  async sendMessage(text: string): Promise<string> {
    const response = await this.chat.sendMessage({ message: text });
    return response.text || "";
  }

  async getSpeech(text: string): Promise<string> {
    const response = await this.ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Say naturally and clearly: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
  }
}

export const tutorService = new GeminiTutorService();
