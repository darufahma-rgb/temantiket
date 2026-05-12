import {
  pgTable, text, varchar, integer, bigint, boolean, numeric,
  timestamp, jsonb, uuid, index, unique, serial,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ── Replit Auth tables (mandatory) ───────────────────────────────────────────

export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (t) => [index("IDX_session_expire").on(t.expire)],
);

export const users = pgTable("users", {
  id: varchar("id").primaryKey(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ── Multi-tenant agency tables ────────────────────────────────────────────────

export const agencies = pgTable("agencies", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  ownerId: text("owner_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const agencyMembers = pgTable(
  "agency_members",
  {
    userId: text("user_id").notNull(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("staff"),
    commissionPct: numeric("commission_pct").default("0"),
    createdAt: timestamp("created_at").defaultNow(),
    // extra agent fields
    phoneWa: text("phone_wa"),
    agentNotes: text("agent_notes"),
    agentStatus: text("agent_status").default("active"),
    cardBackImageUrl: text("card_back_image_url"),
  },
  (t) => [unique("agency_members_user_agency").on(t.userId, t.agencyId)],
);

export const profiles = pgTable("profiles", {
  id: text("id").primaryKey(),
  fullName: text("full_name"),
  email: text("email"),
  photoUrl: text("photo_url"),
  phoneWa: text("phone_wa"),
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ── Clients ──────────────────────────────────────────────────────────────────

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone").notNull().default(""),
    email: text("email"),
    birthDate: text("birth_date"),
    birthPlace: text("birth_place"),
    passportNumber: text("passport_number"),
    passportExpiry: text("passport_expiry"),
    passportIssueDate: text("passport_issue_date"),
    passportIssuingOffice: text("passport_issuing_office"),
    gender: text("gender"),
    photoDataUrl: text("photo_data_url"),
    notes: text("notes"),
    legacyJamaahId: text("legacy_jamaah_id"),
    createdByAgent: text("created_by_agent"),
    referredByClientId: uuid("referred_by_client_id"),
    referralStamps: integer("referral_stamps").default(0),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [index("clients_agency_idx").on(t.agencyId)],
);

// ── Orders ───────────────────────────────────────────────────────────────────

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    clientId: uuid("client_id"),
    type: text("type").notNull().default("umrah"),
    status: text("status").notNull().default("Draft"),
    title: text("title"),
    totalPrice: numeric("total_price").default("0"),
    costPrice: numeric("cost_price").default("0"),
    currency: text("currency").default("IDR"),
    metadata: jsonb("metadata").default({}),
    tripId: uuid("trip_id"),
    packageId: uuid("package_id"),
    jamaahId: uuid("jamaah_id"),
    createdByAgent: text("created_by_agent"),
    notes: text("notes"),
    paymentStatus: text("payment_status").default("UNPAID"),
    paidAmount: numeric("paid_amount").default("0"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [index("orders_agency_idx").on(t.agencyId)],
);

// ── Packages ─────────────────────────────────────────────────────────────────

export const packages = pgTable(
  "packages",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    destination: text("destination").notNull().default(""),
    people: integer("people").default(1),
    days: integer("days").default(1),
    hpp: numeric("hpp").default("0"),
    totalIdr: numeric("total_idr").default("0"),
    status: text("status").default("Draft"),
    emoji: text("emoji").default("📦"),
    coverImage: text("cover_image"),
    departureDate: text("departure_date"),
    returnDate: text("return_date"),
    airline: text("airline"),
    hotelLevel: text("hotel_level"),
    notes: text("notes"),
    facilities: jsonb("facilities"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [index("packages_agency_idx").on(t.agencyId)],
);

// ── Ticket Prices ─────────────────────────────────────────────────────────────

export const ticketPrices = pgTable(
  "ticket_prices",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    airline: text("airline").notNull().default(""),
    airlineCode: text("airline_code").notNull().default(""),
    fromCode: text("from_code").notNull().default(""),
    fromCity: text("from_city").notNull().default(""),
    toCode: text("to_code").notNull().default(""),
    toCity: text("to_city").notNull().default(""),
    departDate: text("depart_date"),
    basePrice: numeric("base_price").default("0"),
    currency: text("currency").default("IDR"),
    validUntil: text("valid_until"),
    notes: text("notes"),
    isPublished: boolean("is_published").default(true),
    sortOrder: integer("sort_order").default(0),
    flightNumber: text("flight_number"),
    etd: text("etd"),
    eta: text("eta"),
    terminal: text("terminal"),
    transitCode: text("transit_code"),
    transitCity: text("transit_city"),
    transitDuration: text("transit_duration"),
    baggageInfo: text("baggage_info"),
    markup: numeric("markup").default("0"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [index("ticket_prices_agency_idx").on(t.agencyId)],
);

// ── Trips ────────────────────────────────────────────────────────────────────

export const trips = pgTable(
  "trips",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    destination: text("destination").notNull().default(""),
    startDate: text("start_date").notNull().default(""),
    endDate: text("end_date").notNull().default(""),
    emoji: text("emoji").default("✈️"),
    coverImage: text("cover_image"),
    quotaPax: integer("quota_pax"),
    pricePerPax: numeric("price_per_pax"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("trips_agency_idx").on(t.agencyId)],
);

// ── Jamaah ───────────────────────────────────────────────────────────────────

export const jamaah = pgTable(
  "jamaah",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone").notNull().default(""),
    birthDate: text("birth_date").notNull().default(""),
    passportNumber: text("passport_number").notNull().default(""),
    passportExpiry: text("passport_expiry"),
    gender: text("gender").default(""),
    photoDataUrl: text("photo_data_url"),
    needsReview: boolean("needs_review").default(false),
    bookingCode: text("booking_code"),
    paymentStatus: text("payment_status").default("Belum Lunas"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("jamaah_trip_idx").on(t.tripId)],
);

// ── Jamaah Documents ──────────────────────────────────────────────────────────

export const jamaahDocs = pgTable(
  "jamaah_docs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    jamaahId: uuid("jamaah_id").notNull().references(() => jamaah.id, { onDelete: "cascade" }),
    category: text("category").notNull().default("other"),
    label: text("label").notNull().default(""),
    fileName: text("file_name").notNull().default(""),
    fileType: text("file_type").notNull().default("image"),
    dataUrl: text("data_url").notNull().default(""),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("jamaah_docs_jamaah_idx").on(t.jamaahId)],
);

// ── Payments ──────────────────────────────────────────────────────────────────

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    jamaahId: uuid("jamaah_id").notNull(),
    tripId: uuid("trip_id"),
    type: text("type").notNull().default("other"),
    amount: numeric("amount").default("0"),
    method: text("method").notNull().default(""),
    paidAt: text("paid_at").notNull().default(""),
    notes: text("notes").notNull().default(""),
    proofUrl: text("proof_url"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("payments_jamaah_idx").on(t.jamaahId)],
);

// ── BC Templates ──────────────────────────────────────────────────────────────

export const bcTemplates = pgTable(
  "bc_templates",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    category: text("category").notNull().default("general"),
    body: text("body").notNull().default(""),
    sortOrder: integer("sort_order").default(0),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [index("bc_templates_agency_idx").on(t.agencyId)],
);

// ── Agency Settings ───────────────────────────────────────────────────────────

export const agencySettings = pgTable(
  "agency_settings",
  {
    agencyId: uuid("agency_id").notNull().references(() => agencies.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: jsonb("value"),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [unique("agency_settings_pk").on(t.agencyId, t.key)],
);

// ── User Settings ─────────────────────────────────────────────────────────────

export const userSettings = pgTable(
  "user_settings",
  {
    userId: text("user_id").notNull(),
    key: text("key").notNull(),
    value: jsonb("value"),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [unique("user_settings_pk").on(t.userId, t.key)],
);

// ── Audit Logs ────────────────────────────────────────────────────────────────

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    agencyId: uuid("agency_id"),
    userId: text("user_id"),
    tableName: text("table_name").notNull(),
    recordId: text("record_id"),
    action: text("action").notNull(),
    oldData: jsonb("old_data"),
    newData: jsonb("new_data"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("audit_logs_agency_idx").on(t.agencyId)],
);

// ── Agent Points ──────────────────────────────────────────────────────────────

export const agentPoints = pgTable(
  "agent_points",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    agencyId: uuid("agency_id").notNull(),
    agentId: text("agent_id").notNull(),
    orderId: uuid("order_id").notNull(),
    points: integer("points").default(20),
    reason: text("reason").default("order_completed"),
    awardedAt: timestamp("awarded_at").defaultNow(),
  },
  (t) => [
    index("agent_points_agency_idx").on(t.agencyId),
    unique("agent_points_order_unique").on(t.orderId),
  ],
);

// ── Agent Wallet Transactions ─────────────────────────────────────────────────

export const agentWalletTransactions = pgTable(
  "agent_wallet_transactions",
  {
    id: text("id").primaryKey(),
    agencyId: uuid("agency_id").notNull(),
    agentId: text("agent_id").notNull(),
    type: text("type").notNull().default("adjustment"),
    pointsDelta: integer("points_delta").default(0),
    amountIdr: numeric("amount_idr").default("0"),
    description: text("description").notNull().default(""),
    createdBy: text("created_by").notNull().default(""),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("wallet_tx_agent_idx").on(t.agentId)],
);

// ── Daily Missions ────────────────────────────────────────────────────────────

export const dailyMissions = pgTable(
  "daily_missions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    agencyId: uuid("agency_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    rewardPoints: integer("reward_points").default(10),
    deadline: text("deadline").notNull(),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at").defaultNow(),
  },
);

// ── Mission Submissions ───────────────────────────────────────────────────────

export const missionSubmissions = pgTable(
  "mission_submissions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    agencyId: uuid("agency_id").notNull(),
    missionId: uuid("mission_id").notNull(),
    agentId: text("agent_id").notNull(),
    status: text("status").default("pending"),
    proofImageUrl: text("proof_image_url"),
    notes: text("notes"),
    rewardPoints: integer("reward_points").default(0),
    submittedAt: timestamp("submitted_at").defaultNow(),
    reviewedAt: timestamp("reviewed_at"),
    reviewedBy: text("reviewed_by"),
  },
);

// ── Reward Redemptions ────────────────────────────────────────────────────────

export const rewardRedemptions = pgTable(
  "reward_redemptions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    agencyId: uuid("agency_id").notNull(),
    agentId: text("agent_id").notNull(),
    rewardKey: text("reward_key").notNull(),
    costPoints: integer("cost_points").default(0),
    status: text("status").default("pending"),
    requestedAt: timestamp("requested_at").defaultNow(),
    processedAt: timestamp("processed_at"),
    processedBy: text("processed_by"),
    notes: text("notes"),
  },
);

// ── Visa Saved Calculations ───────────────────────────────────────────────────

export const visaSavedCalcs = pgTable(
  "visa_saved_calcs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id").notNull(),
    agencyId: uuid("agency_id").notNull(),
    name: text("name").notNull(),
    visaType: text("visa_type").notNull().default("voa"),
    state: jsonb("state"),
    createdAt: timestamp("created_at").defaultNow(),
  },
);

// ── Notes ─────────────────────────────────────────────────────────────────────

export const notes = pgTable(
  "notes",
  {
    id: text("id").primaryKey(),
    agencyId: uuid("agency_id").notNull(),
    title: text("title").notNull().default(""),
    content: text("content").notNull().default(""),
    color: text("color").default("bg-white border-slate-200"),
    pinned: boolean("pinned").default(false),
    tags: jsonb("tags").default([]),
    createdAt: bigint("created_at", { mode: "number" }).default(sql`extract(epoch from now()) * 1000`),
    updatedAt: bigint("updated_at", { mode: "number" }).default(sql`extract(epoch from now()) * 1000`),
  },
  (t) => [index("notes_agency_idx").on(t.agencyId)],
);

// ── Package Calculations ──────────────────────────────────────────────────────

export const packageCalculations = pgTable(
  "package_calculations",
  {
    packageId: uuid("package_id").primaryKey(),
    agencyId: uuid("agency_id").notNull(),
    payload: jsonb("payload"),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
);

// ── PDF Templates ─────────────────────────────────────────────────────────────

export const pdfTemplates = pgTable(
  "pdf_templates",
  {
    id: text("id").primaryKey(),
    agencyId: uuid("agency_id").notNull(),
    name: text("name").notNull().default(""),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("pdf_templates_agency_idx").on(t.agencyId)],
);

// ── Client Documents (for ClientDocVault) ─────────────────────────────────────

export const clientDocs = pgTable(
  "client_docs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    agencyId: uuid("agency_id").notNull(),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    category: text("category").notNull().default("other"),
    label: text("label").notNull().default(""),
    fileName: text("file_name").notNull().default(""),
    fileType: text("file_type").notNull().default("image"),
    dataUrl: text("data_url").notNull().default(""),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("client_docs_client_idx").on(t.clientId)],
);
