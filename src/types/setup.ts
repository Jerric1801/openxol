export interface SetupStatus {
  complete: boolean;
  missing: string[];
}

export interface SetupProgress {
  component: string;
  progress: number;
  message: string;
}
