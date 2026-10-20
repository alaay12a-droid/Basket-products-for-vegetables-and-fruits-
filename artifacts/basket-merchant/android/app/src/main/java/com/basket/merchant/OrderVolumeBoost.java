package com.basket.merchant;

/** Device-independent, crash-recoverable temporary volume ownership. */
final class OrderVolumeBoost {
    interface Device {
        boolean canChange();
        int volume();
        int maximum();
        void setVolume(int value);
    }
    interface Store {
        int original();
        int applied();
        void save(int original, int applied);
        void clear();
    }
    private final Device device;
    private final Store store;
    private boolean active;
    private int lastPercent = -1;

    OrderVolumeBoost(Device device, Store store) { this.device = device; this.store = store; }

    void update(boolean pendingAndSoundEnabled, int percent) {
        if (!pendingAndSoundEnabled) {
            active = false;
            lastPercent = -1;
            restore();
            return;
        }
        // Do not fight a user's hardware volume adjustment or repeat a boost on polling.
        if (active && lastPercent == percent) return;
        if (!active) {
            restore();
            if (store.original() >= 0) return; // Restoration is deferred by silent/DND mode.
        }
        if (!device.canChange()) return;
        int original = active ? store.original() : device.volume();
        int target = Math.max(1, Math.round(device.maximum() * Math.max(10, Math.min(100, percent)) / 100f));
        int previousApplied = store.applied();
        store.save(original, target); // Persist BEFORE changing shared device volume.
        try { device.setVolume(target); }
        catch (RuntimeException error) {
            if (device.volume() != target) {
                if (active && previousApplied >= 0) store.save(original, previousApplied);
                else store.clear();
            }
            throw error;
        }
        active = true;
        lastPercent = percent;
    }

    void restore() {
        int original = store.original();
        if (original < 0) return;
        if (device.volume() != store.applied()) {
            store.clear(); // Preserve an explicit hardware/system volume change.
            return;
        }
        if (!device.canChange()) return;
        device.setVolume(original);
        store.clear();
    }
}
