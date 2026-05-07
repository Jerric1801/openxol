export interface TranscriptionConfig {
  model: string;
  language: string;
  useGpu: boolean;
}

export interface DiarizationConfig {
  enabled: boolean;
  method: 'whisper-native';
}

export interface AnalysisConfig {
  enabled: boolean;
  apiKey: string;
  model: string;
  systemPrompt?: string;
}

export interface DocumentConfig {
  enabled: boolean;
  includeToc: boolean;
  includeSpeakerAnalysis: boolean;
}

export interface OutputConfig {
  directory: string;
  useTimestampedDirs: boolean;
}

export interface Config {
  transcription: TranscriptionConfig;
  diarization: DiarizationConfig;
  analysis: AnalysisConfig;
  document: DocumentConfig;
  output: OutputConfig;
}
