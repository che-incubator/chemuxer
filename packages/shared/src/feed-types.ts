export interface FeedEntry {
  timestamp: string;
  sessionId: string;
  content: string;
}

export interface FeedResponse {
  entries: FeedEntry[];
  nextSince: string;
}
