// Generation counters are stored in cache under these keys.
// Bumping a generation instantly orphans all list cache entries for that resource.
export const GEN = {
  BLOG: 'gen:blog',
  USER: 'gen:user',
  NOTIF_GLOBAL: 'gen:notif:global',
  NOTIF_USER: (userId: string) => `gen:notif:${userId}`,
} as const;

export const CK = {
  // ── Dashboard ────────────────────────────────────────────────────
  DASHBOARD_STATS: 'dashboard:stats',
  DASHBOARD_ACTIVITY: 'dashboard:activity',
  CHART: (days: number) => `dashboard:chart:${days}`,
  COMMON_CHART_DAYS: [7, 14, 30, 60, 90] as const,

  // ── Blog ─────────────────────────────────────────────────────────
  POST: (id: string) => `blog:post:${id}`,
  PUBLIC: (gen: number, page: number, limit: number) => `blog:public:${gen}:${page}:${limit}`,
  BLOG_LIST: (gen: number, page: number, limit: number, status = '', search = '') =>
    `blog:list:${gen}:${page}:${limit}:${status}:${search}`,
  ADMIN_BLOG_LIST: (gen: number, page: number, limit: number, modStatus = '') =>
    `admin:blog:list:${gen}:${page}:${limit}:${modStatus}`,

  // ── Users ─────────────────────────────────────────────────────────
  USER_DETAIL: (id: string) => `users:detail:${id}`,
  USER_LIST: (gen: number, page: number, limit: number) => `users:list:${gen}:${page}:${limit}`,
  USER_POSTS: (userId: string, blogGen: number, page: number, limit: number) =>
    `users:posts:${userId}:${blogGen}:${page}:${limit}`,

  // ── Notifications (per-user, with global gen for broadcast invalidation) ──
  NOTIFICATIONS: (userId: string, userGen: number, globalGen: number, page: number, limit: number) =>
    `notif:${userId}:${userGen}:${globalGen}:${page}:${limit}`,

  // ── Profile ───────────────────────────────────────────────────────
  PROFILE: (userId: string) => `profile:${userId}`,
} as const;

export const TTL = {
  STATS: 5 * 60 * 1000,
  ACTIVITY: 2 * 60 * 1000,
  CHART: 15 * 60 * 1000,
  POST: 10 * 60 * 1000,
  LIST: 5 * 60 * 1000,
  USER_DETAIL: 5 * 60 * 1000,
  NOTIFICATIONS: 2 * 60 * 1000,
  PROFILE: 5 * 60 * 1000,
  GEN: 7 * 24 * 60 * 60 * 1000,
} as const;
