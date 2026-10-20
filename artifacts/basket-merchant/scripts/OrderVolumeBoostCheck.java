package com.basket.merchant;

public final class OrderVolumeBoostCheck {
    private static final class Device implements OrderVolumeBoost.Device {
        int current = 2, changes;
        boolean allowed = true, fail;
        public boolean canChange() { return allowed; }
        public int volume() { return current; }
        public int maximum() { return 10; }
        public void setVolume(int value) {
            if (fail) throw new SecurityException("Synthetic permission failure");
            changes++; current = value;
        }
    }
    private static final class Store implements OrderVolumeBoost.Store {
        int before = -1, target = -1;
        boolean fail;
        public int original() { return before; }
        public int applied() { return target; }
        public void save(int original, int applied) {
            if (fail) throw new IllegalStateException("Synthetic persistence failure");
            before = original; target = applied;
        }
        public void clear() { before = target = -1; }
    }
    private static void check(boolean value, String description) {
        if (!value) throw new AssertionError(description);
    }
    public static void main(String[] args) {
        Device device = new Device();
        Store store = new Store();
        OrderVolumeBoost boost = new OrderVolumeBoost(device, store);
        boost.update(true, 100);
        check(device.current == 10 && store.before == 2, "New order raises volume and remembers original");
        boost.update(true, 100);
        check(device.changes == 1, "Polling / another pending order does not reapply volume");
        boost.update(true, 60);
        check(device.current == 6 && store.before == 2, "Settings apply during alarm without losing original");
        boost.update(false, 60);
        check(device.current == 2 && store.before == -1, "Last resolution or sound off restores original");

        boost.update(true, 100);
        device.current = 4; // User's hardware volume buttons.
        boost.update(true, 100);
        check(device.current == 4, "Do not fight a manual hardware volume adjustment");
        boost.update(false, 100);
        check(device.current == 4 && store.before == -1, "Preserve manual adjustment after resolution");

        device.current = 3;
        boost.update(true, 100);
        boost = new OrderVolumeBoost(device, store); // Process restart, same persisted values.
        boost.update(false, 100);
        check(device.current == 3 && store.before == -1, "Crash recovery restores prior volume");

        device.allowed = false;
        int changes = device.changes;
        boost.update(true, 100);
        check(device.changes == changes, "Silent/DND/fixed-volume policy prevents boost");
        device.allowed = true;
        boost.update(true, 100);
        device.allowed = false;
        boost.update(false, 100);
        check(device.current == 10 && store.before == 3, "DND defers restoration without bypass");
        device.allowed = true;
        boost.update(false, 100);
        check(device.current == 3 && store.before == -1, "Deferred restoration completes when allowed");

        store.fail = true;
        try { boost.update(true, 100); throw new AssertionError("Expected persistence failure"); }
        catch (IllegalStateException expected) {}
        check(device.current == 3, "Never change shared volume if prior value cannot be saved");
        store.fail = false;
        boost.update(true, 100);
        device.fail = true;
        try { boost.update(true, 50); throw new AssertionError("Expected device failure"); }
        catch (SecurityException expected) {}
        device.fail = false;
        boost.update(false, 50);
        check(device.current == 3, "Failed slider adjustment must not lose the original volume");
        System.out.println("Order volume checks PASS: boost/restore, slider, polling, manual override, crash, DND and failures.");
    }
}
