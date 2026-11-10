export type Decision = 'safe' | 'suspicious';
export type ScreeningStatus = 'pending' | Decision;
export type Risk = 'low' | 'medium' | 'high' | 'critical';

export interface Finding {
  id: string;
  title: string;
  detail: string;
  points: number;
}

export interface Analysis {
  url: string;
  hostname: string;
  score: number;
  risk: Risk;
  findings: Finding[];
}

export interface Screening extends Analysis {
  id: string;
  status: ScreeningStatus;
  createdAt: string;
}

export interface Review {
  id: string;
  decision: Decision;
  note: string;
  createdAt: string;
}

export interface ScreeningDetail extends Screening {
  reviews: Review[];
}
