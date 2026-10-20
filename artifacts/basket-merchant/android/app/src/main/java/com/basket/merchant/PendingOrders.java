package com.basket.merchant;

import java.util.HashSet;
import java.util.Set;

/** A confirmed acceptance must not be undone by an older in-flight snapshot. */
final class PendingOrders {
    private final Set<Long> pending = new HashSet<>();
    private final Set<Long> accepted = new HashSet<>();

    synchronized void replace(long[] ids) {
        pending.clear();
        for (long id : ids) if (id > 0 && !accepted.contains(id)) pending.add(id);
    }

    synchronized void accept(long id) {
        if (id > 0) { accepted.add(id); pending.remove(id); }
    }

    synchronized int count() { return pending.size(); }
}
