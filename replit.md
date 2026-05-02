# Temantiket — Travel Management App

## Overview

Temantiket is a comprehensive travel management application designed for Umrah & Haji trips, built with React, Vite, TypeScript, and shadcn/ui. It aims to streamline operations for travel agencies, managing everything from client and order processing to agent performance and financial reporting. The platform features advanced AI capabilities for tasks like itinerary generation, ticket price extraction, and a conversational command center, enhancing efficiency and customer experience. Key capabilities include multi-leg flight itinerary management, dual-layer navigation, real-time data synchronization, and automated invoice generation. The project envisions becoming a leading solution in the travel tech sector, empowering agencies with intelligent tools and a robust, scalable infrastructure.

## User Preferences

*   I want iterative development.
*   I want you to ask before making major changes.
*   I prefer detailed explanations.
*   I do not want you to make changes to the `supabase/schema.sql` file.
*   I do not want you to make changes to the `supabase/migrations/` folder.
*   I do not want you to make changes to the `supabase/functions/` folder.
*   I do not want you to make changes to the `public/templates/promo/` folder.

## System Architecture

The application is a React Single Page Application (SPA) utilizing Vite for the frontend and an Express.js server for backend API endpoints. Supabase serves as the core Backend-as-a-Service (BaaS), handling authentication, database management (PostgreSQL with Row Level Security), real-time subscriptions, and file storage.

**UI/UX Decisions:**

*   **Color Scheme:** Brand Asset palette — **Rich Black** `#00072d` · **Dark Navy** `#051650` · **Navy Blue** `#0a2472` · **Caribbean Blue** `#123499` · interactive accent `#1a44d4`. Tailwind `sky` color scale is overridden in `tailwind.config.ts` to match this palette so all `text-sky-*`, `bg-sky-*`, `border-sky-*` classes automatically render the brand blues. CSS design-system tokens in `index.css` are updated for both light mode (light blue-white bg, Rich Black text) and dark mode (Rich Black bg → Dark Navy cards → Navy Blue chips).
*   **Navigation:** Features a single-panel sidebar (`AppSidebar.tsx`, 240px wide). It shows the Temantiket logo at top, a user profile card with role badge, collapsible section groups ("Main Menu", "Keuangan", "Sistem Agen", "Help & Settings"), a blue gradient AI Itinerary CTA card, and a logout button at the bottom. Active nav items are highlighted with a sky-500 gradient pill. On mobile, the sidebar slides in as an overlay. Desktop header (`DashboardLayout.tsx`) shows a search bar on the left, a live currency rates pill, an AI Assistant shortcut button, a sync status dot, a notification bell, and the user avatar+name on the right.
*   **Boarding Pass Cards:** Designed for clear display of flight information, including large ETD/ETA times, transit indicators, and airline logos fetched from Airhex CDN.
*   **Multi-Leg UI:** Chained legs are rendered with amber transit dots and city pills, consolidating complex itineraries into single, readable cards.

**Technical Implementations:**

*   **Multi-Leg Recognition:** Implemented a `Transit Chain Merger` on the client-side (`ticketPriceAI.ts`) to detect and merge transit-connected flights into a single itinerary unit. This prevents double markup and clarifies pricing for users. The UI component `MultiLegChain` renders these complex itineraries.
*   **AI Integration:** Leverages OpenAI's `gpt-4o-mini` with Vision capabilities for tasks such as:
    *   **Ticket Price Extraction:** AI extracts flight details, including numbers, timings, terminals, and transit information from screenshots.
    *   **Itinerary Generation:** Extracts itineraries from raw PNR/booking text.
    *   **Conversational Command Center:** A floating chat widget (`AIChatWidget.tsx`) uses function calling to interact with 8 distinct tools (e.g., `get_dashboard_summary`, `create_daily_mission`, `calculate_profit`). It includes a context-aware `AIContextualBar` that suggests commands based on the active page.
    *   **Passport OCR:** Direct browser-to-OpenAI passport OCR.
*   **Automated Invoice Generation:** Utilizes `pdf-lib` to generate A4 invoices with dynamic data, custom template overlays, and auto-generated invoice numbers. PDF generation is offloaded to Vercel serverless functions (`api/export/invoice.js`, `api/export/igh.js`) with automatic browser-side fallback via `src/lib/exportPdfApi.ts`. Integrated with the AI Command Center for on-demand generation and WhatsApp sharing.
*   **PNR Command Center:** A universal PNR input widget (`PNRCommandCenter.tsx`) automates extraction of flight/hotel/tour data and can auto-create client, order, invoice, and WhatsApp reminders.
*   **Agent Management System:** Supports multiple roles (owner, staff, agent) with a points-based reward system. `agent_points` are awarded on order completion, and `reward_redemptions` tracks point-to-reward exchanges. Agent wallet functionality is implemented using localStorage for commission conversion.
*   **Order Hub:** Manages universal orders (Umrah, Flight, Visa) and client data.
*   **Reporting:** Features a financial reports section, including a ledger tab (`Buku Besar`) that tracks paid/completed orders with historical exchange rates and running balances.
*   **Real-time Features:** Supabase Realtime subscriptions enable live synchronization across devices, including real-time updates for the Agent Leaderboard.
*   **Environment Setup:** Development uses `npm run dev` to concurrently run the Express API server (port 3001) and Vite development server (port 5000). On Replit, the workflow command is `npm run dev` targeting port 5000. Required Replit env vars (shared): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Required Replit secrets: `SUPABASE_SERVICE_ROLE_KEY` (for admin member operations), `OPENAI_API_KEY` (optional, for AI features).
*   **Server Routes:** All backend endpoints live in `server/index.cjs` — `/api/bootstrap`, `/api/invite-member`, `/api/remove-member`, `/api/ai/chat` (OpenAI proxy). Vercel serverless functions in `api/` serve as an alternative deployment target.
*   **Database Management:** Schema is managed via Supabase SQL Editor, with migrations applied chronologically.

## External Dependencies

*   **Supabase:** Primary BaaS for authentication, PostgreSQL database, real-time subscriptions, and storage.
*   **OpenAI API:** Utilized for AI features such as `gpt-4o-mini` for Vision capabilities, itinerary generation, ticket price extraction, and the AI command center.
*   **Tesseract.js:** Fallback OCR solution when OpenAI API key is not configured.
*   **Vite:** Frontend build tool and development server.
*   **Express.js:** Backend server for API routes requiring service role keys (e.g., user invitation/removal, bootstrap).
*   **shadcn/ui:** UI component library.
*   **React:** Frontend JavaScript library.
*   **TypeScript:** Type-safe JavaScript.
*   **Framer Motion:** For UI animations — page transitions (x-slide via DashboardLayout AnimatePresence), stagger list/card animations on Orders, Packages, TripDetail (jamaah grid), Reports (stat cards), AgentDashboard (stat cards), ExportCenter, AgentDirectory, OrderDetail, and tab-switch animations in Settings.
*   **Airhex CDN:** Used for fetching airline logos based on IATA codes.
*   **pdf-lib:** JavaScript library for creating and modifying PDF documents (used in invoice generation).
*   **Zustand:** State management library (used for invoice store and AI chat store).