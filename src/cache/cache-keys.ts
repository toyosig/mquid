export const CK = {
  DASHBOARD_STATS: 'dashboard:stats',
  DASHBOARD_ACTIVITY: 'dashboard:activity',
  CHART: (days: number) => `dashboard:chart:${days}`,
  POST: (id: string) => `blog:post:${id}`,
  PUBLIC: (page: number, limit: number) => `blog:public:${page}:${limit}`,
  COMMON_CHART_DAYS: [7, 14, 30, 60, 90] as const,
} as const;

export const TTL = {
  STATS: 5 * 60 * 1000,
  ACTIVITY: 2 * 60 * 1000,
  CHART: 15 * 60 * 1000,
  POST: 10 * 60 * 1000,
  PUBLIC: 60 * 1000,
} as const;
