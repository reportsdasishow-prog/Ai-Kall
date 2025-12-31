
export enum Role {
  USER = 'user',
  TUTOR = 'tutor'
}

export type EnglishLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type LanguageGoal = 'English' | 'Russian';

export type PracticeMode = 'MENU' | 'CONVERSATION' | 'INTERVIEW' | 'CUSTOM';

export interface User {
  username: string;
  level: EnglishLevel;
  targetLanguage: LanguageGoal;
}

export interface Message {
  id: string;
  role: Role;
  text: string;
  timestamp: Date;
  audioUrl?: string;
  isCorrecting?: boolean;
}
