import { pointInPolygon, type LatLng } from "./geo";

export interface ResolverBranch {
  id: number;
  name: string;
  active: boolean;
  deliveryEnabled: boolean;
  lat: number | null;
  lng: number | null;
  weeklyOperatingHours?: unknown;
  deliveryCapacity?: number | null;
  activeDeliveryOrderCount?: number;
  /** Per requested product override; omitted means no override. */
  productAvailability?: Record<string, boolean | undefined>;
  /** Authoritative menu availability for requested products. */
  globalProductAvailability?: Record<string, boolean | undefined>;
}

export interface ResolverZone {
  id: number;
  branchId: number | null;
  enabled: boolean;
  sortOrder: number;
  polygon: unknown;
}

type ValidResolverZone = Omit<ResolverZone, "polygon"> & { polygon: LatLng[] };

export type BranchExclusionReason =
  | "inactive_branch"
  | "delivery_disabled"
  | "missing_coordinates"
  | "closed"
  | "no_matching_zone"
  | "product_unavailable"
  | "at_capacity";

export interface BranchExclusion {
  branchId: number;
  reason: BranchExclusionReason;
}

export interface EligibleBranch {
  id: number;
  name: string;
  distanceKm: number;
  matchingZoneId: number;
}

export type BranchResolverOutcome =
  | "selected"
  | "no_active_delivery_branches"
  | "no_eligible_branch_coordinates"
  | "outside_delivery_zones";

export interface BranchResolution {
  selectedBranchId: number | null;
  selectedBranchName: string | null;
  distanceKm: number | null;
  matchingZoneId: number | null;
  eligibleBranches: EligibleBranch[];
  exclusions: BranchExclusion[];
  outcome: BranchResolverOutcome;
}

export type CoordinateValidation =
  | { ok: true; point: LatLng }
  | { ok: false; error: string };

const weekDays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
type WeekDay = typeof weekDays[number];
export type WeeklyOperatingHours = Record<WeekDay, "closed" | { open: string; close: string }>;

function validTime(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return false;
  const [hour, minute] = value.split(":").map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

/** Validates the stored shape; null means operating hours are unrestricted. */
export function validateWeeklyOperatingHours(value: unknown): { ok: true; value: WeeklyOperatingHours | null } | { ok: false; error: string } {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "object" || Array.isArray(value) || value === null) {
    return { ok: false, error: "weeklyOperatingHours must be null or a sun-sat map" };
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== weekDays.length || weekDays.some((day) => !(day in record))) {
    return { ok: false, error: "weeklyOperatingHours must contain exactly sun, mon, tue, wed, thu, fri, sat" };
  }
  for (const day of weekDays) {
    const hours = record[day];
    if (hours === "closed") continue;
    if (typeof hours !== "object" || Array.isArray(hours) || hours === null
      || Object.keys(hours as object).length !== 2
      || !validTime((hours as { open?: unknown }).open)
      || !validTime((hours as { close?: unknown }).close)
      || (hours as { open: string }).open === (hours as { close: string }).close) {
      return { ok: false, error: `${day} must be closed or an open/close HH:mm interval with different times` };
    }
  }
  return { ok: true, value: value as WeeklyOperatingHours };
}

function riyadhDayAndMinutes(now: Date): { day: WeekDay; previousDay: WeekDay; minutes: number } {
  const pieces = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => pieces.find((piece) => piece.type === type)?.value ?? "";
  const order: Record<string, WeekDay> = { Sun: "sun", Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri", Sat: "sat" };
  const day = order[get("weekday")];
  const index = weekDays.indexOf(day);
  return { day, previousDay: weekDays[(index + 6) % 7], minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

export function isBranchOpen(weeklyOperatingHours: unknown, now = new Date()): boolean {
  const validated = validateWeeklyOperatingHours(weeklyOperatingHours);
  if (!validated.ok) return false;
  if (validated.value === null) return true;
  const { day, previousDay, minutes } = riyadhDayAndMinutes(now);
  const openNow = (entry: WeeklyOperatingHours[WeekDay], allowOvernight: boolean) => {
    if (entry === "closed") return false;
    const [oh, om] = entry.open.split(":").map(Number);
    const [ch, cm] = entry.close.split(":").map(Number);
    const open = oh * 60 + om, close = ch * 60 + cm;
    return open < close ? !allowOvernight && minutes >= open && minutes < close
      : allowOvernight ? minutes < close : minutes >= open;
  };
  return openNow(validated.value[day], false) || openNow(validated.value[previousDay], true);
}

function isValidPolygon(polygon: unknown): polygon is LatLng[] {
  return Array.isArray(polygon)
    && polygon.length >= 3
    && polygon.every((vertex): vertex is LatLng =>
      typeof vertex === "object"
      && vertex !== null
      && "lat" in vertex
      && "lng" in vertex
      && typeof vertex.lat === "number"
      && typeof vertex.lng === "number"
      && Number.isFinite(vertex.lat)
      && Number.isFinite(vertex.lng)
      && vertex.lat >= -90
      && vertex.lat <= 90
      && vertex.lng >= -180
      && vertex.lng <= 180);
}

function roundDistance(distanceKm: number): number {
  return Number(distanceKm.toFixed(6));
}

export function haversineKm(from: LatLng, to: LatLng): number {
  const earthRadiusKm = 6371;
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(to.lat - from.lat);
  const longitudeDelta = toRadians(to.lng - from.lng);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat))
    * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function validateResolveCoordinates(latValue: unknown, lngValue: unknown): CoordinateValidation {
  const parse = (value: unknown, name: "lat" | "lng"): number | string => {
    if (typeof value !== "string" && typeof value !== "number") return `${name} is required`;
    if (typeof value === "string" && value.trim() === "") return `${name} is required`;
    const number = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(number)) return `${name} must be a finite number`;
    return number;
  };
  const lat = parse(latValue, "lat");
  if (typeof lat === "string") return { ok: false, error: lat };
  const lng = parse(lngValue, "lng");
  if (typeof lng === "string") return { ok: false, error: lng };
  if (lat < -90 || lat > 90) return { ok: false, error: "lat must be between -90 and 90" };
  if (lng < -180 || lng > 180) return { ok: false, error: "lng must be between -180 and 180" };
  return { ok: true, point: { lat, lng } };
}

export function resolveNearestBranch(
  point: LatLng,
  branches: readonly ResolverBranch[],
  zones: readonly ResolverZone[],
  now = new Date(),
): BranchResolution {
  const zonesByBranch = new Map<number, ValidResolverZone[]>();
  for (const zone of zones) {
    if (zone.enabled !== true || zone.branchId === null || !isValidPolygon(zone.polygon)) continue;
    const branchZones = zonesByBranch.get(zone.branchId) ?? [];
    branchZones.push({ ...zone, polygon: zone.polygon });
    zonesByBranch.set(zone.branchId, branchZones);
  }
  for (const branchZones of zonesByBranch.values()) {
    branchZones.sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id);
  }

  const eligibleCandidates: Array<EligibleBranch & { rawDistanceKm: number }> = [];
  const exclusions: BranchExclusion[] = [];
  let hasActiveDeliveryBranch = false;
  let hasCoordinateEligibleBranch = false;
  const seenBranchIds = new Set<number>();

  for (const branch of [...branches].sort((left, right) => left.id - right.id)) {
    if (seenBranchIds.has(branch.id)) continue;
    seenBranchIds.add(branch.id);
    if (branch.active !== true) {
      exclusions.push({ branchId: branch.id, reason: "inactive_branch" });
      continue;
    }
    if (branch.deliveryEnabled !== true) {
      exclusions.push({ branchId: branch.id, reason: "delivery_disabled" });
      continue;
    }
    hasActiveDeliveryBranch = true;
    const branchLat = branch.lat;
    const branchLng = branch.lng;
    if (branchLat === null
      || branchLng === null
      || !Number.isFinite(branchLat)
      || !Number.isFinite(branchLng)
      || branchLat < -90
      || branchLat > 90
      || branchLng < -180
      || branchLng > 180) {
      exclusions.push({ branchId: branch.id, reason: "missing_coordinates" });
      continue;
    }
    if (!isBranchOpen(branch.weeklyOperatingHours ?? null, now)) {
      exclusions.push({ branchId: branch.id, reason: "closed" });
      continue;
    }
    hasCoordinateEligibleBranch = true;
    const matchingZone = (zonesByBranch.get(branch.id) ?? [])
      .find((zone) => pointInPolygon(point, zone.polygon));
    if (!matchingZone) {
      exclusions.push({ branchId: branch.id, reason: "no_matching_zone" });
      continue;
    }
    const globalAvailable = Object.values(branch.globalProductAvailability ?? {}).every((available) => available === true);
    const branchAvailable = Object.values(branch.productAvailability ?? {}).every((available) => available !== false);
    if (!globalAvailable || !branchAvailable) {
      exclusions.push({ branchId: branch.id, reason: "product_unavailable" });
      continue;
    }
    if (branch.deliveryCapacity !== null && branch.deliveryCapacity !== undefined
      && (branch.activeDeliveryOrderCount ?? 0) >= branch.deliveryCapacity) {
      exclusions.push({ branchId: branch.id, reason: "at_capacity" });
      continue;
    }
    const rawDistanceKm = haversineKm(point, { lat: branchLat, lng: branchLng });
    eligibleCandidates.push({
      id: branch.id,
      name: branch.name,
      distanceKm: roundDistance(rawDistanceKm),
      matchingZoneId: matchingZone.id,
      rawDistanceKm,
    });
  }

  eligibleCandidates.sort((left, right) => left.rawDistanceKm - right.rawDistanceKm || left.id - right.id);
  const eligibleBranches = eligibleCandidates.map(({ rawDistanceKm: _rawDistanceKm, ...branch }) => branch);
  const selected = eligibleBranches[0];
  const outcome: BranchResolverOutcome = selected
    ? "selected"
    : !hasActiveDeliveryBranch
      ? "no_active_delivery_branches"
      : !hasCoordinateEligibleBranch
        ? "no_eligible_branch_coordinates"
        : "outside_delivery_zones";

  return {
    selectedBranchId: selected?.id ?? null,
    selectedBranchName: selected?.name ?? null,
    distanceKm: selected?.distanceKm ?? null,
    matchingZoneId: selected?.matchingZoneId ?? null,
    eligibleBranches,
    exclusions,
    outcome,
  };
}