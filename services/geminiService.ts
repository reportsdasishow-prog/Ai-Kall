
import { GoogleGenAI, Modality } from "@google/genai";
import { blobToBase64 } from "./audioService";
import { EnglishLevel, LanguageGoal, PracticeMode } from "../types";

export class GeminiTutorService {
  private currentLevel: EnglishLevel = 'B1';
  private targetLanguage: LanguageGoal = 'English';
  private currentMode: PracticeMode = 'MENU';
  private customScenario: string = '';

  private getAI() {
    // The API key is obtained exclusively from the environment variable process.env.API_KEY.
    return new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
  }

  private getSystemInstruction() {
    const levelDescriptions: Record<EnglishLevel, string> = {
      'A1': 'Beginner. Use very simple words and short sentences.',
      'A2': 'Elementary. Simple language but start introducing basic past and future tenses.',
      'B1': 'Intermediate. Standard language. Focus on common expressions.',
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

    return `You are a friendly and professional ${tutorLang} Tutor. 
    Current Student Level: ${this.currentLevel}. ${levelDescriptions[this.currentLevel]}
    ${modeInstruction}
    
    Your goals:
    1. Listen to the user's spoken or written input.
    2. Politely correct any grammatical errors or awkward phrasing relative to their level.
    3. Maintain an encouraging conversation.
    4. Keep your responses short (max 3 sentences) for voice playback.
    
    IMPORTANT: When processing audio, you must provide both a transcription of what you heard and your response.
    Format your entire response exactly like this:
    [TRANSCRIPTION] (what you heard the user say)
    [RESPONSE] (your correction and reply to the user)`;
  }

  startSession(level: EnglishLevel, targetLanguage: LanguageGoal, mode: PracticeMode, scenario: string = '') {
    this.currentLevel = level;
    this.targetLanguage = targetLanguage;
    this.currentMode = mode;
    this.customScenario = scenario;
  }

  async processAudio(audioBlob: Blob): Promise<string> {
    const ai = this.getAI();
    const base64Audio = await blobToBase64(audioBlob);
    const mimeType = audioBlob.type.split(';')[0] || 'audio/webm';
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Audio,
              },
            },
            { text: "Please transcribe my speech and respond to it using the [TRANSCRIPTION] and [RESPONSE] format." }
          ],
        },
      ],
      config: {
        systemInstruction: this.getSystemInstruction(),
      }
    });

    return response.text || "";
  }

  async sendMessage(text: string): Promise<string> {
    const ai = this.getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text }] }],
      config: {
        systemInstruction: this.getSystemInstruction(),
      },
    });
    return response.text || "";
  }

  async getSpeech(text: string): Promise<string> {
    try {
      const ai = this.getAI();
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Say this naturally: ${text}` }] }],
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
    } catch (error) {
      console.error("TTS generation failed:", error);
      return "";
    }
  }
}

export const tutorService = new GeminiTutorService();
