export type DriverBranchMembership = {
  driverId: number;
  branchId: number;
  active: boolean;
};

/**
 * A legacy order without a branch deliberately retains the pre-branch dispatch
 * rules. Branch orders require at least one active membership for that exact
 * branch (rather than any membership the driver may have).
 */
export function hasActiveMembershipForOrderBranch(
  driverId: number,
  orderBranchId: number | null,
  memberships: readonly DriverBranchMembership[],
): boolean {
  return orderBranchId == null || memberships.some(membership =>
    membership.driverId === driverId &&
    membership.branchId === orderBranchId &&
    membership.active,
  );
}

/** Filters branch-ineligible candidates and preserves only one row per driver. */
export function filterEligibleDriversForOrderBranch<T extends { id: number }>(
  drivers: readonly T[],
  orderBranchId: number | null,
  memberships: readonly DriverBranchMembership[],
): T[] {
  const seen = new Set<number>();
  return drivers.filter(driver => {
    if (seen.has(driver.id) ||
        !hasActiveMembershipForOrderBranch(driver.id, orderBranchId, memberships)) {
      return false;
    }
    seen.add(driver.id);
    return true;
  });
}

/** The ID-oriented form is useful when a join produces duplicate candidates. */
export function filterEligibleDriverIdsForOrderBranch(
  driverIds: readonly number[],
  orderBranchId: number | null,
  memberships: readonly DriverBranchMembership[],
): number[] {
  return filterEligibleDriversForOrderBranch(
    driverIds.map(id => ({ id })),
    orderBranchId,
    memberships,
  ).map(driver => driver.id);
}

/** A branch order may only be batched with active orders from that same branch. */
export function activeOrdersCanBatchForOrderBranch(
  orderBranchId: number | null,
  activeOrderBranchIds: readonly (number | null)[],
): boolean {
  return orderBranchId == null || activeOrderBranchIds.every(branchId => branchId === orderBranchId);
}