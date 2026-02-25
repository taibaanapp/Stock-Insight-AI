export interface WeeklyUpdate {
  week: number;
  price: number;
  date: string;
  analysis: string;
  alignment_score?: number; // 0-100
  alignment_reason?: string;
}

export interface Prediction {
  id: string;
  ticker: string;
  chart_image: string;
  user_prediction: 'up' | 'down';
  user_reasoning: string;
  target_price?: number;
  gemini_prediction: 'up' | 'down';
  gemini_reasoning: string;
  gemini_alignment_score?: number;
  gemini_alignment_reason?: string;
  initial_price: number;
  created_at: string;
  status: 'active' | 'completed';
  weekly_data: WeeklyUpdate[];
  final_retrospective?: string;
}
