package com.basket.merchant;

public final class PendingOrdersCheck {
    private static void count(PendingOrders state, int expected, String message) {
        if (state.count() != expected) throw new AssertionError(message);
    }
    public static void main(String[] args) {
        PendingOrders state = new PendingOrders();
        state.replace(new long[]{101, 102, 102, -1});
        count(state, 2, "Pending orders must be unique positive IDs.");
        state.accept(101);
        count(state, 1, "Accepting one order must not silence the other.");
        state.replace(new long[]{101, 102});
        count(state, 1, "An old snapshot must not restart an accepted order's alert.");
        state.accept(102);
        count(state, 0, "Accepting the last pending order must silence the alert.");
        state.replace(new long[]{101, 102, 103});
        count(state, 1, "A genuinely new order must still ring.");
        state.replace(new long[]{});
        count(state, 0, "Authoritative cancellation/removal must clear pending orders.");
        state.replace(new long[]{104, 105});
        // Confirmed cancellation uses the same native resolution acknowledgement.
        state.accept(104);
        count(state, 1, "Cancelling one order must keep the other order ringing.");
        state.replace(new long[]{104, 105});
        count(state, 1, "A stale snapshot must not restart a confirmed cancelled order.");
        state.accept(105);
        count(state, 0, "Cancelling the final pending order must stop the alert.");
        System.out.println("Pending alert checks passed: multiple orders, confirmed acceptance/cancellation, stale snapshots and new orders.");
    }
}
