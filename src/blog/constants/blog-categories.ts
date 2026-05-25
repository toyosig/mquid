export const BLOG_CATEGORIES = [
  'Company News',
  'Solutions',
  'Insights',
  'Case Studies',
] as const;

export type BlogCategory = (typeof BLOG_CATEGORIES)[number];
