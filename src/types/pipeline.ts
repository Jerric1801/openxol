export interface PipelineError {
  step: string;
  error: string;
  critical: boolean;
}

export interface TranscriptSegment {
  text: string;
  speaker?: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

export interface TranscriptResult {
  text: string;
  segments: TranscriptSegment[];
  language?: string;
  raw?: unknown;
}

export interface AnalysisResult {
  raw: string;
  structured: {
    executiveSummary: string;
    keyDecisions: string;
    actionItems: string;
    keyThemes: string;
  };
  executiveSummary: string;
  keyDecisions: string;
  actionItems: string;
  keyThemes: string;
}

export interface PipelineResult {
  audioPath: string;
  transcript: TranscriptResult | null;
  diarized: TranscriptResult | null;
  analysis: AnalysisResult | null;
  docxPath: string | null;
  errors: PipelineError[];
}

export interface ProgressUpdate {
  step: string;
  progress: number;
  stepProgress?: number;
  overallProgress?: number;
  message: string;
  type?: string;
  result?: Partial<PipelineResult>;
}
