import assert from "node:assert/strict";
import {
  extractCoordinatesFromAddress,
  mapOrderBranchAssignment,
  resolveDeliveryCoordinates,
} from "../src/lib/orderBranchAssignment.ts";
import { resolveNearestBranch } from "../src/lib/branchResolver.ts";

const zone = {
  id: 17,
  branchId: 2,
  enabled: true,
  sortOrder: 0,
  polygon: [
    { lat: 24, lng: 46 },
    { lat: 24, lng: 48 },
    { lat: 26, lng: 48 },
    { lat: 26, lng: 46 },
  ],
};
const branches = [
  { id: 1, name: "Far branch", active: true, deliveryEnabled: true, lat: 25.9, lng: 47.9 },
  { id: 2, name: "Assigned branch", active: true, deliveryEnabled: true, lat: 25, lng: 47 },
];

// Existing checkout sends this exact Google Maps q= format.
assert.deepEqual(extractCoordinatesFromAddress("https://maps.google.com/?q=25,47"), {
  ok: true,
  point: { lat: 25, lng: 47 },
});
assert.equal(extractCoordinatesFromAddress("25,47").ok, false);
assert.equal(extractCoordinatesFromAddress("https://maps.google.com/?q=25,north").ok, false);
assert.equal(resolveDeliveryCoordinates({ deliveryLat: 25 }).ok, false);
assert.deepEqual(resolveDeliveryCoordinates({ deliveryLat: 25, deliveryLng: 47 }), {
  ok: true,
  point: { lat: 25, lng: 47 },
});

const coordinates = resolveDeliveryCoordinates({ customerAddress: "https://maps.google.com/?q=25,47" });
assert.equal(coordinates.ok, true);
if (!coordinates.ok) throw new Error("coordinates should be valid");
const resolution = resolveNearestBranch(coordinates.point, branches, [zone]);
const deliveryAssignment = mapOrderBranchAssignment("delivery", {
  branchId: 999,
  branchName: "Tampered branch",
}, { point: coordinates.point, resolution });

// A submitted branch is ignored for delivery and full resolver metadata is retained.
assert.deepEqual(deliveryAssignment.branchId, 2);
assert.equal(deliveryAssignment.branchName, "Assigned branch");
assert.equal(deliveryAssignment.deliveryLat, 25);
assert.equal(deliveryAssignment.deliveryLng, 47);
assert.equal(deliveryAssignment.deliveryZoneId, 17);
assert.equal(deliveryAssignment.branchDistanceKm, 0);
assert.equal(deliveryAssignment.branchAssignmentMethod, "nearest_eligible_branch");
assert.ok(deliveryAssignment.branchAssignedAt instanceof Date);

// Invalid coordinates halt before the next (resolver/write) step.
let writes = 0;
const invalidCoordinates = resolveDeliveryCoordinates({ customerAddress: "https://maps.google.com/?q=91,47" });
if (invalidCoordinates.ok) writes += 1;
assert.equal(writes, 0);

const pickupAssignment = mapOrderBranchAssignment("pickup", {
  branchId: 999,
  branchName: "Customer selected branch",
}, null);
assert.equal(pickupAssignment.branchId, 999);
assert.equal(pickupAssignment.branchName, "Customer selected branch");
assert.equal(pickupAssignment.deliveryLat, null);
assert.equal(pickupAssignment.branchAssignmentMethod, null);
assert.equal(resolveDeliveryCoordinates({ deliveryLat: "invalid", deliveryLng: 47 }).ok, false);

// Assignment mapping is additive and leaves checkout financial/payment values intact.
const checkoutFields = {
  totalPrice: 78.5,
  deliveryFee: 12,
  discountCode: "SAVE",
  discountAmount: 5,
  paymentMethod: "moyasar",
};
const persisted = { ...checkoutFields, ...deliveryAssignment };
assert.deepEqual(
  Object.fromEntries(Object.keys(checkoutFields).map((key) => [key, persisted[key as keyof typeof persisted]])),
  checkoutFields,
);

console.log("Order branch assignment tests passed");