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

// Fill in your Canny board IDs below
export const BOARDS: BoardConfig[] = [
  {
    cannyId: "69dd91a6101dd51b00677e0c",
    slug: "customer-ideas",
    name: "Customer Ideas",
    displayOrder: 0,
  },
  {
    cannyId: "69dd91d2eef3251ac9c41091",
    slug: "market-ideas",
    name: "Market Opportunities",
    displayOrder: 1,
  },
  {
    cannyId: "69dd91e37587ef995a08ef54",
    slug: "ux-inspiration",
    name: "UI/UX Inspiration",
    displayOrder: 2,
  },
  {
    cannyId: "670c2bce89df784b49c2252e",
    slug: "platform-feedback",
    name: "FutureFit AI",
    displayOrder: 3,
  },
];

export const BOARD_BY_CANNY_ID = Object.fromEntries(
  BOARDS.map((b) => [b.cannyId, b])
);

export const BOARD_BY_SLUG = Object.fromEntries(
  BOARDS.map((b) => [b.slug, b])
);
