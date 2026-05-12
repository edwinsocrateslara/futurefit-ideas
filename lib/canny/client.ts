const CANNY_API_BASE = "https://canny.io/api/v1";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export interface CannyPost {
  id: string;
  title: string;
  details: string;
  score: number;
  url: string;
  created: string; // ISO string
  board: { id: string; name: string };
  status: string;
  tags: Array<{ id: string; name: string }>;
  customFields?: Array<{ id: string; name: string; value: string | null }>;
}

interface CannyPostsResponse {
  posts: CannyPost[];
  hasMore: boolean;
}

async function cannyRequest<T>(
  endpoint: string,
  body: Record<string, unknown>
): Promise<T> {
  const apiKey = process.env.CANNY_API_KEY;
  if (!apiKey) throw new Error("CANNY_API_KEY is not set");

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
    }

    const res = await fetch(`${CANNY_API_BASE}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey, ...body }),
    });

    if (res.status === 429) {
      // Rate limited — wait longer before retry
      await new Promise((r) => setTimeout(r, 5000));
      lastError = new Error("Canny rate limit hit");
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Canny API error ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
  }

  throw lastError ?? new Error("Canny request failed after retries");
}

// Fetch all posts for a board, paginating through all results
export async function fetchBoardPosts(boardId: string): Promise<CannyPost[]> {
  const all: CannyPost[] = [];
  let skip = 0;
  const limit = 100;

  while (true) {
    const data = await cannyRequest<CannyPostsResponse>("/posts/list", {
      boardID: boardId,
      limit,
      skip,
    });

    all.push(...data.posts);

    if (!data.hasMore) break;
    skip += limit;
  }

  return all;
}

// Fetch posts created within a date range (used to identify this week's items)
export async function fetchBoardPostsSince(
  boardId: string,
  since: Date
): Promise<CannyPost[]> {
  const all = await fetchBoardPosts(boardId);
  return all.filter((p) => new Date(p.created) >= since);
}
