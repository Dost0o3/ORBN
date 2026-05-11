# ORBN (formerly IFT-iD)

## Overview
ORBN is an AI-powered professional/social network designed to connect professionals, foster communities, and enhance career growth. It aims to provide a dynamic platform for users to network, discover opportunities, and leverage AI for personal and professional development. The project is structured as a pnpm monorepo, encompassing a React 19 + Vite frontend, an Express 5 + Drizzle backend, an Expo React Native iOS/Android app, and a mockup sandbox. Key capabilities include AI-driven networking tools (Soul Twin, Career Oracle), comprehensive profile management, a jobs board, bounty system, and a robust notification system. The platform integrates payments via Stripe, analytics with PostHog and GA4, and authentication through Clerk.

## User Preferences
- All new UI is additive — no existing component or screen was restyled.
- Agent Mode is opt-in with explicit consent gate; nothing is sent on the user's behalf without `agentAutonomyEnabled` (Set & Forget) being separately turned on.
- All agent endpoints require Clerk auth + per-user daily rate limit (429 on exceed).

## System Architecture

### UI/UX Decisions (Watermorphism Design System)
The application (both web and mobile) adopts a "Watermorphism" design system inspired by Apple iOS.
- **Background**: Deep blue (`#0B1828`) with a fluid wallpaper image (`wallpaper-fluid.jpg`) bleeding through.
- **Surfaces**: Utilize `BlurView` / `backdrop-filter: blur(20px) saturate(180%)` for cards, headers, composer, and tab bars.
- **Primary Accent**: Coral orange (`#E8754A`) with glow shadows.
- **Destructive Color**: Crimson (`#DC143C`).
- **Card Border**: Translucent cool blue glass border (`rgba(100,180,220,0.18)`).
- **Text Colors**: Cool white (`#EEF4FF`) and muted blue-gray (`#6A8EAE`).
- **Border Radius**: 14px for web (`--radius`) and 20px for mobile (`colors.radius`).

### Technical Implementations
- **Monorepo Structure**: Pnpm monorepo managing `nexusid` (web frontend), `api-server` (backend), `ift-mobile` (mobile app), and `mockup-sandbox`.
- **Frontend**: React 19, Vite 7, Wouter for routing, TanStack Query for data fetching, Tailwind v4, shadcn/ui (Radix primitives) for UI components, Framer Motion for animations.
- **Backend**: Express 5, Drizzle ORM (Postgres), Zod for schema validation, Pino for logging, Helmet for security, express-rate-limit, CORS allowlist, vitest + supertest for testing.
- **Mobile**: Expo SDK 53, React Native, Expo Router for file-system routing, Clerk Expo SDK, shared API client via TanStack Query. The production API host is centralized in `artifacts/ift-mobile/lib/api-base.ts` (`API_BASE`, `API_DOMAIN`, `WEB_DOMAIN`, `WEB_BASE_URL` — all derived from `EXPO_PUBLIC_DOMAIN`, falling back to `nexasid.replit.app`); every screen, hook, and component imports from there instead of re-deriving the URL. Mobile screens cover full feature parity with web for: Feed (For You + Trending tabs, trending hashtags chip row, suggested-users carousel), Explore, Connect (full PanResponder swipe deck with Pass/Super-Like/Connect + match modal), Profile (QR + verification badge, FollowListSheet on followers/following tap, ProfileActionsMenu with block/unblock/report, automatic ghost-view recording), Jobs, Bounties, Leaderboard, Notifications (Soul Twin AgentQueuePanel with Pending + History tabs, approve/reject/retry/undo), Soul Twin, Career Oracle (Operator-only premium gate via `/api/billing/me`, copy-to-clipboard of analysis), Messages/DMs (NewMessageSheet user search, TTL self-destruct picker Off/1m/1h/24h passed via `data.ttlSeconds`, thread overflow menu for block/report/clear, expired-message placeholders), Communities, Inner Circles, Pricing/Billing (Stripe checkout + portal), Privacy & Security (Ghost Mode, DM read receipts, push prefs, blocked users), Admin Reports (admin-only triage of user reports + admin roster promote/revoke, gated on `me.isAdmin`), plus mobile-only studio screens (Insights, Monetize, Scheduled, AI Activity, Challenges, Invite). Composer supports image upload (`pickAndUploadImage`), per-post anonymous toggle (auto-on when Ghost Mode active), schedule presets, and AI suggest/enhance. PostCard has a 3-dot menu (delete/block/report), anonymous comment toggle in CommentSheet, and optimistic counts. Hidden screens reachable via a hamburger menu (`app/menu.tsx`); admin link appears in menu when `me.isAdmin === true`.
- **Authentication**: Clerk for email, social, and passkey authentication across web and mobile.
- **AI Integration**: OpenAI models (e.g., `gpt-4o-mini-search-preview`, `gpt-4o-mini`) via Replit AI Integrations proxy for Soul Twin, Career Oracle, and post drafting. Soul Twin includes personalized system prompts using user profile and post history, and live web search capabilities.
- **Subscription Management**: Stripe for payments, checkout sessions, customer portal, and webhooks to manage `subscriptions` table.
- **Analytics**: PostHog and Google Analytics 4, conditionally enabled based on environment variables.
- **Onboarding**: driver.js 4-step tour, triggered on first visit to `/feed`.
- **Performance**: Lazy-loading for most web pages, Vite manualChunks for optimized bundling, React Query with `staleTime` and `gcTime` configurations (mobile `staleTime` is 0 for real-time data).
- **SEO**: Dynamic title/description updates via `usePageMeta` hook, `robots.txt` and `sitemap.xml` served by API server.
- **Security**: Helmet headers, CORS allowlist, express-rate-limit, Stripe webhook signature verification, Zod validation for all user input, Clerk session verification.

### Feature Specifications
- **Web Pages**: Includes landing, feed, explore, connect (swipe-to-match), user profiles, jobs, communities, notifications, AI tools (Soul Twin, Career Oracle), post creation, bounties, circles, leaderboard, pricing, and billing.
- **Mobile Screens**: Tab bar (Feed, Explore, Create, Notifications, Profile), stack screens for editing profile, settings, Soul Twin (SSE streaming AI chat), leaderboard, bounties (CRUD), jobs, challenges, insights, scheduled posts, monetize, invite, and AI activity log.
- **Mobile Creator Features**: AI Suggest button for topic ideas, scheduled post picker, Trending Niche section, Challenges discover tile, enhanced profile quick-links and settings for creators.
- **Profile**: Features a 3D parallax HoloAvatar, animated PowerScoreDial gauge, 90-day ActivityHeatmap, StatTiles, copy-link, and rank ribbon. Editable fields include `displayName`, `bio`, `location`, `website`, `occupation`, `gender`, `phone`, `avatarUrl`. Unique QR codes encode permanent profile URLs.
- **Subscription Tiers**: Recruit (Free), Operator ($19/mo with premium features), Enterprise (custom pricing). Subscription state managed in `subscriptions` table, updated via Stripe webhooks.
- **Soul Twin 2.0 + Live Power Score**: Introduces new tables for `user_style_profiles`, `soul_twin_actions`, `soul_twin_opportunities`, `achievements`, `daily_streaks`, `power_score_snapshots`, `endorsements`. New API endpoints for streaming power score, streaks, achievements, agent mode controls, and agent-driven actions. Post and feed ranking algorithms now incorporate author power score. UI additions include `PowerScoreDial`, `StreakChip`, `AchievementIcons`, and agent-mode toggles/panels. Agent Mode is opt-in and rate-limited.
- **Five Differentiator Features (all live)**:
  1. **Power Score** — see Soul Twin 2.0 above; computed by `getPowerScore()` and exposed via `/api/users/:userId/power-score` (+ SSE stream). Rendered everywhere via `PowerBadge` and `PowerScoreDial`.
  2. **Dark Horse Leaderboard** — `artifacts/api-server/src/routes/leaderboard.ts` ranks rising users by recent power-score velocity; surfaced at `artifacts/nexusid/src/pages/leaderboard.tsx`.
  3. **Ghost Mode** — account-wide toggle (`users.ghost_mode`) editable from the sidebar (`GhostModeToggle` in `app-layout.tsx`). When on, new posts are stored with `posts.is_anonymous = true`; the post author is replaced with an "Anonymous" placeholder for every viewer except the author themselves, and anonymous posts are excluded entirely from the by-user listing (`/api/users/:userId/posts`) for non-author viewers to prevent URL-based de-anonymization.
  4. **Bounty Board** — `artifacts/api-server/src/routes/bounties.ts` (CRUD + submissions); UI at `artifacts/nexusid/src/pages/bounties.tsx` and the mobile bounties stack screen.
  5. **Inner Circles** — `artifacts/api-server/src/routes/circles.ts` (invite-only communities with members/posts); UI at `artifacts/nexusid/src/pages/circles.tsx`.

## External Dependencies

- **Database**: PostgreSQL (via Drizzle ORM).
- **Authentication**: Clerk (clerk.com).
- **AI Services**: OpenAI API (via Replit AI Integrations proxy).
- **Payments**: Stripe.
- **Analytics**: PostHog, Google Analytics 4 (GA4).
- **UI Libraries**: shadcn/ui (based on Radix UI primitives), Framer Motion.
- **Routing**: Wouter (web), Expo Router (mobile).
- **Data Fetching**: TanStack Query.
- **Onboarding Tour**: driver.js.
- **Logging**: Pino.
- **Security**: Helmet.
- **Testing**: vitest, supertest.
- **QR Code Generation**: `qrcode` package.