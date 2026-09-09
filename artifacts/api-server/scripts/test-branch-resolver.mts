import assert from "node:assert/strict";
import {
  resolveNearestBranch,
  isBranchOpen,
  validateWeeklyOperatingHours,
  validateResolveCoordinates,
  type ResolverBranch,
  type ResolverZone,
} from "../src/lib/branchResolver.ts";

const point = { lat: 0, lng: 0 };
const polygon = [
  { lat: -1, lng: -1 },
  { lat: -1, lng: 1 },
  { lat: 1, lng: 1 },
  { lat: 1, lng: -1 },
];
const branch = (id: number, overrides: Partial<ResolverBranch> = {}): ResolverBranch => ({
  id, name: `Branch ${id}`, active: true, deliveryEnabled: true, lat: id, lng: 0, ...overrides,
});
const zone = (id: number, branchId: number | null, overrides: Partial<ResolverZone> = {}): ResolverZone => ({
  id, branchId, enabled: true, sortOrder: 0, polygon, ...overrides,
});
const hours = (open: string | null, close?: string) => ({
  sun: open ? { open, close: close! } : "closed", mon: "closed", tue: "closed", wed: "closed",
  thu: "closed", fri: "closed", sat: "closed",
});
const riyadh = (utc: string) => new Date(utc);

// One eligible branch.
let result = resolveNearestBranch(point, [branch(1)], [zone(10, 1)]);
assert.equal(result.selectedBranchId, 1);
assert.equal(result.outcome, "selected");
assert.equal(result.eligibleBranches.length, 1);
assert.ok(Math.abs(result.distanceKm! - 111.194927) < 0.000001);

// Nearest of two.
result = resolveNearestBranch(point, [branch(1), branch(2, { lat: 2 })], [zone(10, 1), zone(20, 2)]);
assert.equal(result.selectedBranchId, 1);

// Inactive and delivery-disabled nearest branches are excluded.
result = resolveNearestBranch(point, [branch(1, { active: false }), branch(2)], [zone(10, 1), zone(20, 2)]);
assert.equal(result.selectedBranchId, 2);
assert.deepEqual(result.exclusions, [{ branchId: 1, reason: "inactive_branch" }]);
result = resolveNearestBranch(point, [branch(1, { deliveryEnabled: false }), branch(2)], [zone(10, 1), zone(20, 2)]);
assert.equal(result.selectedBranchId, 2);
assert.deepEqual(result.exclusions, [{ branchId: 1, reason: "delivery_disabled" }]);

// Missing coordinates and a point outside every zone do not authorize delivery.
result = resolveNearestBranch(point, [branch(1, { lat: null })], [zone(10, 1)]);
assert.equal(result.outcome, "no_eligible_branch_coordinates");
assert.deepEqual(result.exclusions, [{ branchId: 1, reason: "missing_coordinates" }]);
result = resolveNearestBranch({ lat: 5, lng: 5 }, [branch(1)], [zone(10, 1)]);
assert.equal(result.outcome, "outside_delivery_zones");

// Null hours remain unrestricted; strict hours handle open, closed and overnight
// periods in Asia/Riyadh (UTC+3).
assert.equal(isBranchOpen(null, riyadh("2024-01-07T09:00:00Z")), true);
assert.equal(isBranchOpen(hours("09:00", "17:00"), riyadh("2024-01-07T09:00:00Z")), true);
assert.equal(isBranchOpen(hours("09:00", "17:00"), riyadh("2024-01-07T18:00:00Z")), false);
const overnight = { ...hours(null), sat: { open: "22:00", close: "02:00" } };
assert.equal(isBranchOpen(overnight, riyadh("2024-01-06T19:30:00Z")), true);
assert.equal(isBranchOpen(overnight, riyadh("2024-01-06T21:30:00Z")), true);
assert.equal(validateWeeklyOperatingHours({ ...hours("09:00", "09:00") }).ok, false);
assert.equal(validateWeeklyOperatingHours({ ...hours(null), sun: null }).ok, false);

// Global false always wins; branch false excludes only that branch; absent
// overrides preserve availability. Capacity has no effect when null.
result = resolveNearestBranch(point, [
  branch(1, { productAvailability: { a: false }, globalProductAvailability: { a: true } }),
  branch(2, { globalProductAvailability: { a: true }, deliveryCapacity: null }),
], [zone(10, 1), zone(20, 2)]);
assert.equal(result.selectedBranchId, 2);
result = resolveNearestBranch(point, [branch(1, { globalProductAvailability: { a: false } })], [zone(10, 1)]);
assert.equal(result.selectedBranchId, null);
result = resolveNearestBranch(point, [
  branch(1, { deliveryCapacity: 2, activeDeliveryOrderCount: 1 }),
  branch(2, { deliveryCapacity: 1, activeDeliveryOrderCount: 1 }),
], [zone(10, 1), zone(20, 2)]);
assert.equal(result.selectedBranchId, 1);

// Branch 1 is eligible while Branch 2 is inactive; it remains unmodified.
const branch2 = branch(2, { active: false });
result = resolveNearestBranch(point, [branch(1), branch2], [zone(10, 1), zone(20, 2)]);
assert.equal(result.selectedBranchId, 1);
assert.equal(branch2.active, false);

// Overlapping zones choose the nearest branch.
result = resolveNearestBranch(point, [branch(1, { lat: 0.5 }), branch(2, { lat: 0.1 })], [zone(10, 1), zone(20, 2)]);
assert.equal(result.selectedBranchId, 2);

// Multiple matching zones for a branch are deduped and use sort order then id.
result = resolveNearestBranch(point, [branch(1)], [zone(20, 1, { sortOrder: 1 }), zone(10, 1, { sortOrder: 1 })]);
assert.equal(result.eligibleBranches.length, 1);
assert.equal(result.matchingZoneId, 10);

// Invalid/missing coordinates are rejected before resolver use.
assert.deepEqual(validateResolveCoordinates(undefined, "0"), { ok: false, error: "lat is required" });
assert.deepEqual(validateResolveCoordinates("north", "0"), { ok: false, error: "lat must be a finite number" });
assert.deepEqual(validateResolveCoordinates("91", "0"), { ok: false, error: "lat must be between -90 and 90" });
assert.deepEqual(validateResolveCoordinates("0", undefined), { ok: false, error: "lng is required" });
assert.deepEqual(validateResolveCoordinates("0", "181"), { ok: false, error: "lng must be between -180 and 180" });

// Equal distances resolve deterministically by branch id.
result = resolveNearestBranch(point, [branch(2, { lat: 1 }), branch(1, { lat: -1 })], [zone(20, 2), zone(10, 1)]);
assert.equal(result.selectedBranchId, 1);

// Empty data and unusable zones are safe and never authorize a branch.
assert.deepEqual(resolveNearestBranch(point, [], []).eligibleBranches, []);
result = resolveNearestBranch(point, [branch(1)], [
  zone(1, null),
  zone(2, 999),
  zone(3, 1, { enabled: false }),
  zone(4, 1, { polygon: null }),
  zone(5, 1, { polygon: [{ lat: 0, lng: 0 }] }),
  zone(6, 1, { polygon: [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }, null] }),
]);
assert.equal(result.selectedBranchId, null);
assert.equal(result.outcome, "outside_delivery_zones");

// Duplicate branch records remain one candidate and input objects are not mutated.
const duplicateBranch = branch(1);
const immutableBranches = [duplicateBranch, { ...duplicateBranch }];
const immutableZones = [zone(10, 1), zone(11, 1)];
const snapshot = JSON.stringify({ immutableBranches, immutableZones });
result = resolveNearestBranch(point, immutableBranches, immutableZones);
assert.equal(result.eligibleBranches.length, 1);
assert.equal(JSON.stringify({ immutableBranches, immutableZones }), snapshot);

// Non-finite/out-of-range stored branch coordinates are excluded safely.
result = resolveNearestBranch(point, [branch(1, { lat: Number.NaN }), branch(2, { lng: 181 })], [zone(10, 1), zone(20, 2)]);
assert.equal(result.outcome, "no_eligible_branch_coordinates");
assert.deepEqual(result.exclusions, [
  { branchId: 1, reason: "missing_coordinates" },
  { branchId: 2, reason: "missing_coordinates" },
]);

console.log("branch resolver tests passed");