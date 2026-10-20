package com.basket.merchant;

import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.media.AudioManager;

/** Local device preference only: never written to merchant API settings or the database. */
final class OrderAlarmVolume {
    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences("basket_order_volume", Context.MODE_PRIVATE);
    }
    static int percent(Context context) { return preferences(context).getInt("percent", 100); }
    static void setPercent(Context context, int percent) {
        if (percent < 10 || percent > 100) throw new IllegalArgumentException("Volume must be 10–100");
        if (!preferences(context).edit().putInt("percent", percent).commit())
            throw new IllegalStateException("Could not save order volume");
    }
    static OrderVolumeBoost create(Context context) {
        AudioManager audio = context.getSystemService(AudioManager.class);
        NotificationManager notifications = context.getSystemService(NotificationManager.class);
        SharedPreferences saved = preferences(context);
        return new OrderVolumeBoost(new OrderVolumeBoost.Device() {
            public boolean canChange() {
                return audio != null && !audio.isVolumeFixed()
                    && audio.getRingerMode() == AudioManager.RINGER_MODE_NORMAL
                    && notifications != null
                    && notifications.getCurrentInterruptionFilter() == NotificationManager.INTERRUPTION_FILTER_ALL;
            }
            public int volume() { return audio == null ? -1 : audio.getStreamVolume(AudioManager.STREAM_NOTIFICATION); }
            public int maximum() { return audio.getStreamMaxVolume(AudioManager.STREAM_NOTIFICATION); }
            public void setVolume(int value) { audio.setStreamVolume(AudioManager.STREAM_NOTIFICATION, value, 0); }
        }, new OrderVolumeBoost.Store() {
            public int original() { return saved.getInt("original", -1); }
            public int applied() { return saved.getInt("applied", -1); }
            public void save(int original, int applied) {
                if (!saved.edit().putInt("original", original).putInt("applied", applied).commit())
                    throw new IllegalStateException("Could not save previous device volume");
            }
            public void clear() {
                if (!saved.edit().remove("original").remove("applied").commit())
                    throw new IllegalStateException("Could not clear previous device volume");
            }
        });
    }
}
