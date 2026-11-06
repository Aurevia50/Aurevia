# Live News & Activity Feed

## Federal Reserve RSS

- Directory (not a feed): https://www.federalreserve.gov/feeds/feeds.htm
- **Selected XML feed:** https://www.federalreserve.gov/feeds/press_all.xml (All Press Releases)
- Category: Economic News
- Default poll interval: 15 minutes

## GNews

- Server-side only via `GNEWS_API_KEY`
- Free non-commercial plan: local development and testing only
- Production commercial use requires a commercial plan and `AUREVIA_GNEWS_ALLOW_PRODUCTION=true`
- Never set `NEXT_PUBLIC_GNEWS_API_KEY`

## Environment variables (names only)

- `GNEWS_API_KEY`
- `AUREVIA_GNEWS_ALLOW_PRODUCTION`
- `CRON_SECRET`

## Synchronization

- Admin: `POST /api/admin/news-feed` (authenticated administrator)
- Cron: `GET /api/cron/news-feed` with `Authorization: Bearer $CRON_SECRET`
- Public read: `GET /api/news-feed?page=1&pageSize=12&category=ECONOMIC_NEWS`

## Database

Migration: `prisma/migrations/20261024120000_news_feed`

```bash
npx prisma migrate deploy
# or for local dev
npx prisma db push
```

## UI

- Home `#news` section: compact feed
- `/news` full page

## Adding another RSS source

Extend `DEFAULT_NEWS_SOURCES` in `lib/news-feed/sources.ts` or insert a `NewsFeedSource` row with `providerType=RSS` and an HTTPS `feedUrl`.
