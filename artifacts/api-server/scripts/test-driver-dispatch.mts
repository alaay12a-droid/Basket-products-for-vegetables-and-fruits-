import assert from "node:assert/strict";
import {
  filterEligibleDriverIdsForOrderBranch,
  filterEligibleDriversForOrderBranch,
  hasActiveMembershipForOrderBranch,
  activeOrdersCanBatchForOrderBranch,
} from "../src/lib/driverDispatch.ts";

const drivers = [
  { id: 1, name: "branch 1" },
  { id: 2, name: "branch 2" },
  { id: 3, name: "multi branch" },
  { id: 4, name: "inactive membership" },
  { id: 1, name: "branch 1 duplicate candidate" },
];
const memberships = [
  { driverId: 1, branchId: 10, active: true },
  { driverId: 1, branchId: 10, active: true }, // duplicate joined membership
  { driverId: 2, branchId: 20, active: true },
  { driverId: 3, branchId: 10, active: true },
  { driverId: 3, branchId: 20, active: true },
  { driverId: 4, branchId: 10, active: false },
];

assert.equal(hasActiveMembershipForOrderBranch(1, 10, memberships), true);
assert.equal(hasActiveMembershipForOrderBranch(1, 20, memberships), false);
assert.equal(hasActiveMembershipForOrderBranch(4, 10, memberships), false);
assert.equal(hasActiveMembershipForOrderBranch(2, null, memberships), true);

assert.deepEqual(
  filterEligibleDriversForOrderBranch(drivers, 10, memberships).map(driver => driver.id),
  [1, 3],
);
assert.deepEqual(
  filterEligibleDriversForOrderBranch(drivers, 20, memberships).map(driver => driver.id),
  [2, 3],
);
assert.deepEqual(filterEligibleDriverIdsForOrderBranch([1, 1, 2, 4], 10, memberships), [1]);
assert.deepEqual(
  filterEligibleDriverIdsForOrderBranch([1, 1, 2, 4], null, memberships),
  [1, 2, 4],
);
assert.deepEqual(filterEligibleDriverIdsForOrderBranch([2, 4], 10, memberships), []);
assert.equal(activeOrdersCanBatchForOrderBranch(10, [10, 10]), true);
assert.equal(activeOrdersCanBatchForOrderBranch(10, [10, 20]), false);
assert.equal(activeOrdersCanBatchForOrderBranch(10, [null]), false);
assert.equal(activeOrdersCanBatchForOrderBranch(null, [10, null]), true);

console.log("Driver dispatch branch eligibility tests passed");