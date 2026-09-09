import {
  type BranchResolution,
  type CoordinateValidation,
  validateResolveCoordinates,
} from "./branchResolver";

export interface DeliveryCoordinateInput {
  deliveryLat?: unknown;
  deliveryLng?: unknown;
  customerAddress?: string | null;
}

export interface OrderBranchAssignment {
  branchId: number | null;
  branchName: string | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
  deliveryZoneId: number | null;
  branchAssignmentMethod: string | null;
  branchDistanceKm: number | null;
  branchAssignedAt: Date | null;
}

const coordinate = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)";
const qCoordinatePair = new RegExp(`^(${coordinate}),(${coordinate})$`);

/**
 * Reads only a q=latitude,longitude query parameter. Address text, place names,
 * and non-coordinate Google Maps URLs are intentionally never interpreted.
 */
export function extractCoordinatesFromAddress(address: string | null | undefined): CoordinateValidation {
  if (typeof address !== "string" || address.trim() === "") {
    return { ok: false, error: "delivery coordinates are required" };
  }

  const value = address.trim();
  let q: string | null = null;
  try {
    q = new URL(value).searchParams.get("q");
  } catch {
    // A direct query string is supported for clients which store q=... without
    // the Google Maps URL, but arbitrary address prose is not.
    if (value.startsWith("?") || value.startsWith("q=")) {
      q = new URLSearchParams(value.startsWith("?") ? value.slice(1) : value).get("q");
    }
  }
  const match = q?.match(qCoordinatePair);
  if (!match) return { ok: false, error: "delivery coordinates are invalid" };
  return validateResolveCoordinates(match[1], match[2]);
}

export function resolveDeliveryCoordinates(input: DeliveryCoordinateInput): CoordinateValidation {
  const hasExplicitLat = input.deliveryLat !== undefined;
  const hasExplicitLng = input.deliveryLng !== undefined;
  if (hasExplicitLat || hasExplicitLng) {
    if (!hasExplicitLat || !hasExplicitLng) {
      return { ok: false, error: "both delivery coordinates are required" };
    }
    return validateResolveCoordinates(input.deliveryLat, input.deliveryLng);
  }
  return extractCoordinatesFromAddress(input.customerAddress);
}

export function mapOrderBranchAssignment(
  orderType: "delivery" | "pickup",
  submittedBranch: { branchId?: number | null; branchName?: string | null },
  delivery: { point: { lat: number; lng: number }; resolution: BranchResolution } | null,
): OrderBranchAssignment {
  if (orderType === "pickup") {
    return {
      branchId: submittedBranch.branchId ?? null,
      branchName: submittedBranch.branchName ?? null,
      deliveryLat: null,
      deliveryLng: null,
      deliveryZoneId: null,
      branchAssignmentMethod: null,
      branchDistanceKm: null,
      branchAssignedAt: null,
    };
  }

  if (!delivery
    || delivery.resolution.selectedBranchId === null
    || delivery.resolution.selectedBranchName === null
    || delivery.resolution.matchingZoneId === null
    || delivery.resolution.distanceKm === null) {
    throw new Error("A selected delivery branch is required before mapping an order assignment");
  }

  return {
    branchId: delivery.resolution.selectedBranchId,
    branchName: delivery.resolution.selectedBranchName,
    deliveryLat: delivery.point.lat,
    deliveryLng: delivery.point.lng,
    deliveryZoneId: delivery.resolution.matchingZoneId,
    branchAssignmentMethod: "nearest_eligible_branch",
    branchDistanceKm: delivery.resolution.distanceKm,
    branchAssignedAt: new Date(),
  };
}