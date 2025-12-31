
import { GoogleGenAI, Modality } from "@google/genai";
import { blobToBase64 } from "./audioService";
import { EnglishLevel, LanguageGoal, PracticeMode } from "../types";

export class GeminiTutorService {
  private currentLevel: EnglishLevel = 'B1';
  private targetLanguage: LanguageGoal = 'English';
  private currentMode: PracticeMode = 'MENU';
  private customScenario: string = '';

  private getAI() {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error("API_KEY is missing in the environment. Please ensure it is configured.");
    }
    return new GoogleGenAI({ apiKey });
  }

  private getSystemInstruction() {
    const levelDescriptions: Record<EnglishLevel, string> = {
      'A1': 'Beginner. Use very simple words.',
      'A2': 'Elementary. Simple sentences.',
      'B1': 'Intermediate. Standard expressions.',
      'B2': 'Upper Intermediate. Rich vocabulary.',
      'C1': 'Advanced. Complex grammar.',
      'C2': 'Proficiency. Native professional level.'
    };

    const tutorLang = this.targetLanguage === 'English' ? 'English' : 'Russian';
    let modeInstruction = this.currentMode === 'INTERVIEW' 
      ? "You are a job interviewer. Be formal." 
      : this.currentMode === 'CUSTOM' 
      ? `Context: ${this.customScenario}` 
      : "A casual friendly conversation.";

    return `You are a professional ${tutorLang} tutor. 
    Student level: ${this.currentLevel}. ${levelDescriptions[this.currentLevel]}
    ${modeInstruction}
    
    Rules:
    1. Transcribe the user audio if provided.
    2. Correct mistakes politely.
    3. Keep responses under 3 sentences.
    4. Return format: [TRANSCRIPTION] text [RESPONSE] text.`;
  }

  startSession(level: EnglishLevel, targetLanguage: LanguageGoal, mode: PracticeMode, scenario: string = '') {
    this.currentLevel = level;
    this.targetLanguage = targetLanguage;
    this.currentMode = mode;
    this.customScenario = scenario;
  }

  async processAudio(audioBlob: Blob): Promise<string> {
    try {
      const ai = this.getAI();
      const base64Audio = await blobToBase64(audioBlob);
      const mimeType = audioBlob.type.includes(';') ? audioBlob.type.split(';')[0] : (audioBlob.type || 'audio/webm');
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            parts: [
              { inlineData: { mimeType, data: base64Audio } },
              { text: `Transcribe and respond in ${this.targetLanguage}. Format: [TRANSCRIPTION] ... [RESPONSE] ...` }
            ]
          }
        ],
        config: {
          systemInstruction: this.getSystemInstruction()
        }
      });

      return response.text || "No response from AI.";
    } catch (error: any) {
      console.error("Gemini Audio Error:", error);
      throw new Error(error.message || "Failed to process audio");
    }
  }

  async sendMessage(text: string): Promise<string> {
    try {
      const ai = this.getAI();
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ role: 'user', parts: [{ text }] }],
        config: {
          systemInstruction: this.getSystemInstruction()
        }
      });
      return response.text || "No response.";
    } catch (error: any) {
      console.error("Gemini Text Error:", error);
      throw new Error(error.message || "Failed to send message");
    }
  }

  async getSpeech(text: string): Promise<string> {
    try {
      const ai = this.getAI();
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
          }
        }
      });
      return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
    } catch (error) {
      return "";
    }
  }
}

export const tutorService = new GeminiTutorService();
