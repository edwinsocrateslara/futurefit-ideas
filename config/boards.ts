import { BOARDS_DATA } from "./boards.mjs";

export type BoardSlug =
  | "customer-ideas"
  | "market-ideas"
  | "ux-inspiration"
  | "platform-feedback";

export interface BoardConfig {
  cannyId: string;
  slug: BoardSlug;
  name: string;
  displayOrder: number;
}

export const BOARDS: BoardConfig[] = BOARDS_DATA as BoardConfig[];

export const BOARD_BY_CANNY_ID = Object.fromEntries(
  BOARDS.map((b) => [b.cannyId, b])
);

export const BOARD_BY_SLUG = Object.fromEntries(
  BOARDS.map((b) => [b.slug, b])
);
