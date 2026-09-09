import { pgTable, serial, text, integer, jsonb, timestamp, boolean, pgEnum, real, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod";

export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "preparing",
  "ready",
  "out_for_delivery",
  "done",
  "cancelled",
]);

export const orderTypeEnum = pgEnum("order_type", ["delivery", "pickup"]);

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  dailyNumber: integer("daily_number").notNull().default(0),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  customerAddress: text("customer_address"),
  items: jsonb("items").notNull(),
  totalPrice: integer("total_price").notNull(),
  deliveryFee: integer("delivery_fee").notNull().default(0),
  discountCode: text("discount_code"),
  discountAmount: integer("discount_amount"),
  orderType: orderTypeEnum("order_type").default("delivery").notNull(),
  status: orderStatusEnum("status").default("pending").notNull(),
  paymentMethod: text("payment_method").default("cash").notNull(),
  notes: text("notes"),
  customerPushToken: text("customer_push_token"),
  branchId: integer("branch_id"),
  branchName: text("branch_name"),
  deliveryLat: real("delivery_lat"),
  deliveryLng: real("delivery_lng"),
  deliveryZoneId: integer("delivery_zone_id"),
  branchAssignmentMethod: text("branch_assignment_method"),
  branchDistanceKm: real("branch_distance_km"),
  branchAssignedAt: timestamp("branch_assigned_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertOrderSchema = z.object({
  dailyNumber: z.number().int().optional(),
  customerName: z.string(),
  customerPhone: z.string(),
  customerAddress: z.string().nullable().optional(),
  items: z.unknown(),
  totalPrice: z.number().int(),
  deliveryFee: z.number().int().optional(),
  orderType: z.enum(["delivery", "pickup"]).optional(),
  status: z.enum(["pending", "preparing", "ready", "out_for_delivery", "done", "cancelled"]).optional(),
  paymentMethod: z.string().optional(),
  notes: z.string().nullable().optional(),
  customerPushToken: z.string().nullable().optional(),
});
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;

export const menuItemsTable = pgTable("menu_items", {
  id: serial("id").primaryKey(),
  itemId: text("item_id").notNull().unique(),
  name: text("name").notNull(),
  nameEn: text("name_en"),
  category: text("category").notNull(),
  price: integer("price").notNull(),
  available: boolean("available").notNull().default(true),
  imageKey: text("image_key"),
  imageUrl: text("image_url"),
  stock: integer("stock"),
  sizes: jsonb("sizes").$type<{ name: string; price: number; enabled: boolean }[]>().notNull().default([]),
  options: jsonb("options").$type<{ groupName: string; required: boolean; choices: { name: string; extraPrice: number; available: boolean }[] }[]>().notNull().default([]),
  riceTypes: jsonb("rice_types").$type<{ name: string; extraPrice: number; available: boolean }[]>().notNull().default([]),
  additions: jsonb("additions").$type<{ name: string; extraPrice: number; available: boolean }[]>().notNull().default([]),
  calories: integer("calories"),
  walkingMinutes: integer("walking_minutes"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type MenuItem = typeof menuItemsTable.$inferSelect;

export const occasionsTable = pgTable("occasions", {
  id: serial("id").primaryKey(),
  occasionId: text("occasion_id").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  imageKey: text("image_key"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Occasion = typeof occasionsTable.$inferSelect;

export const bannersTable = pgTable("banners", {
  id: serial("id").primaryKey(),
  bannerId: text("banner_id").notNull().unique(),
  imageUrl: text("image_url").notNull(),
  imageKey: text("image_key"),
  title: text("title"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Banner = typeof bannersTable.$inferSelect;

export const combosTable = pgTable("combos", {
  id: serial("id").primaryKey(),
  comboId: text("combo_id").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  price: integer("price").notNull(),
  imageUrl: text("image_url"),
  imageKey: text("image_key"),
  components: jsonb("components").notNull().default([]),
  available: boolean("available").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Combo = typeof combosTable.$inferSelect;

export const appSettingsTable = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const pushTokensTable = pgTable("push_tokens", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  fcmToken: text("fcm_token"),
  role: text("role").default("cashier").notNull(), // "cashier" | "customer" | "driver"
  driverId: integer("driver_id"),
  customerName: text("customer_name"),
  lastActiveAt: timestamp("last_active_at"),
  reEngagementSentAt: timestamp("re_engagement_sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type PushToken = typeof pushTokensTable.$inferSelect;

export const walletTransactionTypeEnum = pgEnum("wallet_transaction_type", [
  "deposit",
  "withdrawal",
  "expiry",
]);

export const walletsTable = pgTable("wallets", {
  phone: text("phone").primaryKey(),
  balance: integer("balance").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Wallet = typeof walletsTable.$inferSelect;

export const walletTransactionsTable = pgTable("wallet_transactions", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull(),
  type: walletTransactionTypeEnum("type").notNull(),
  amount: integer("amount").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  note: text("note"),
  orderId: integer("order_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type WalletTransaction = typeof walletTransactionsTable.$inferSelect;

export const messagesTable = pgTable("messages", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  text: text("text").notNull(),
  fromCashier: boolean("from_cashier").notNull().default(false),
  driverId: integer("driver_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  readAt: timestamp("read_at"),
});

export type Message = typeof messagesTable.$inferSelect;

export const orderRatingsTable = pgTable("order_ratings", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().unique(),
  stars: integer("stars").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type OrderRating = typeof orderRatingsTable.$inferSelect;

export const driverRatingsTable = pgTable("driver_ratings", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().unique(),
  driverId: integer("driver_id").notNull(),
  stars: integer("stars").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type DriverRating = typeof driverRatingsTable.$inferSelect;

export const deliveryDriversTable = pgTable("delivery_drivers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  photoUrl: text("photo_url"),
  photoKey: text("photo_key"),
  active: boolean("active").notNull().default(true),
  isOnline: boolean("is_online").notNull().default(false),
  pin: text("pin").notNull().default("0000"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLat: real("last_lat"),
  lastLng: real("last_lng"),
  lastLocationAt: timestamp("last_location_at"),
});

export type DeliveryDriver = typeof deliveryDriversTable.$inferSelect;

export const orderDriverAssignmentsTable = pgTable("order_driver_assignments", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().unique(),
  driverId: integer("driver_id").notNull(),
  status: text("status").notNull().default("assigned"),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  pickedUpAt: timestamp("picked_up_at"),
  deliveredAt: timestamp("delivered_at"),
  driverLat: real("driver_lat"),
  driverLng: real("driver_lng"),
  locationUpdatedAt: timestamp("location_updated_at"),
  driverRating: integer("driver_rating"),
});

export type OrderDriverAssignment = typeof orderDriverAssignmentsTable.$inferSelect;

export const discountCodesTable = pgTable("discount_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  type: text("type").notNull().default("fixed"), // "fixed" | "percentage"
  value: integer("value").notNull().default(0),
  minOrder: integer("min_order").notNull().default(0),
  description: text("description").notNull().default(""),
  active: boolean("active").notNull().default(true),
  expiresAt: timestamp("expires_at"),
  maxUses: integer("max_uses"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type DiscountCode = typeof discountCodesTable.$inferSelect;

export const discountCodeUsagesTable = pgTable("discount_code_usages", {
  id: serial("id").primaryKey(),
  discountCodeId: integer("discount_code_id").notNull().references(() => discountCodesTable.id, { onDelete: "cascade" }),
  phone: text("phone").notNull(),
  orderId: integer("order_id"),
  usedAt: timestamp("used_at").defaultNow().notNull(),
});

export const deliveryZonesTable = pgTable("delivery_zones", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  polygon: jsonb("polygon").notNull().default([]),
  deliveryFee: integer("delivery_fee").notNull().default(0),
  minOrder: integer("min_order").notNull().default(0),
  enabled: boolean("enabled").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  branchId: integer("branch_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type DeliveryZone = typeof deliveryZonesTable.$inferSelect;

export const dashboardUsersTable = pgTable("dashboard_users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("employee"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type DashboardUser = typeof dashboardUsersTable.$inferSelect;

// ── Referrals ─────────────────────────────────────────────────────────────────
// Each customer gets a unique referral code tied to their phone number.
// When a referred customer places their first order, a reward is credited
// to the referrer's wallet.
export const referralsTable = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referrerPhone: text("referrer_phone").notNull(),
  referrerName: text("referrer_name").notNull().default(""),
  referredPhone: text("referred_phone").notNull().unique(),
  referredName: text("referred_name").notNull().default(""),
  orderId: integer("order_id"),
  rewardAmount: integer("reward_amount").notNull().default(0),
  rewarded: boolean("rewarded").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  rewardedAt: timestamp("rewarded_at"),
});

export type Referral = typeof referralsTable.$inferSelect;

// ── Deleted Accounts ──────────────────────────────────────────────────────────
// Minimal record kept after account deletion for the 30-day re-registration
// cooldown. Contains ONLY the phone number and deletion timestamp — no name,
// address, or other personal profile data.
export const deletedAccountsTable = pgTable("deleted_accounts", {
  phone: text("phone").primaryKey(),
  deletedAt: timestamp("deleted_at").defaultNow().notNull(),
});

export type DeletedAccount = typeof deletedAccountsTable.$inferSelect;

// ── Branches ──────────────────────────────────────────────────────────────────
export const branchesTable = pgTable("branches", {
  id:        serial("id").primaryKey(),
  name:      text("name").notNull(),
  address:   text("address"),
  phone:     text("phone"),
  mapsUrl:   text("maps_url"),
  active:    boolean("active").notNull().default(true),
  lat:       real("lat"),
  lng:       real("lng"),
  deliveryEnabled: boolean("delivery_enabled").notNull().default(true),
  pickupEnabled: boolean("pickup_enabled").notNull().default(true),
  weeklyOperatingHours: jsonb("weekly_operating_hours"),
  deliveryCapacity: integer("delivery_capacity"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type Branch = typeof branchesTable.$inferSelect;

export const branchProductAvailabilityTable = pgTable("branch_product_availability", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id").notNull().references(() => branchesTable.id, { onDelete: "cascade" }),
  itemId: text("item_id").notNull().references(() => menuItemsTable.itemId, { onDelete: "cascade" }),
  available: boolean("available").notNull(),
}, (table) => [uniqueIndex("branch_product_availability_branch_item_unique").on(table.branchId, table.itemId)]);
export type BranchProductAvailability = typeof branchProductAvailabilityTable.$inferSelect;

export const driverBranchMembershipsTable = pgTable("driver_branch_memberships", {
  id: serial("id").primaryKey(),
  driverId: integer("driver_id").notNull().references(() => deliveryDriversTable.id, { onDelete: "cascade" }),
  branchId: integer("branch_id").notNull().references(() => branchesTable.id, { onDelete: "cascade" }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type DriverBranchMembership = typeof driverBranchMembershipsTable.$inferSelect;

export const dashboardUserBranchesTable = pgTable("dashboard_user_branches", {
  id: serial("id").primaryKey(),
  dashboardUserId: integer("dashboard_user_id").notNull().references(() => dashboardUsersTable.id, { onDelete: "cascade" }),
  branchId: integer("branch_id").notNull().references(() => branchesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type DashboardUserBranch = typeof dashboardUserBranchesTable.$inferSelect;
