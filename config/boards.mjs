// Single source of truth for board data — plain JS so both config/boards.ts
// (TypeScript) and scripts/*.mjs (plain Node ESM) can import it.

export const BOARDS_DATA = [
  { cannyId: "69dd91a6101dd51b00677e0c", slug: "customer-ideas",    name: "Customer Ideas",       displayOrder: 0 },
  { cannyId: "69dd91d2eef3251ac9c41091", slug: "market-ideas",      name: "Market Opportunities", displayOrder: 1 },
  { cannyId: "69dd91e37587ef995a08ef54", slug: "ux-inspiration",    name: "UX/UI Inspiration",    displayOrder: 2 },
  { cannyId: "670c2bce89df784b49c2252e", slug: "platform-feedback", name: "FutureFit AI",         displayOrder: 3 },
];
