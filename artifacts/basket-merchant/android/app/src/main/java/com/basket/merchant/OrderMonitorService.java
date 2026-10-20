package com.basket.merchant;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import java.io.IOException;

/** Visible, user-started foreground service. Does not promise exemption from Android power limits. */
public class OrderMonitorService extends Service {
    public static volatile boolean connected = false;
    private static volatile OrderMonitorService instance;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final OkHttpClient client = new OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS).readTimeout(20, TimeUnit.SECONDS)
        .pingInterval(20, TimeUnit.SECONDS).build();
    private final AtomicBoolean fetching = new AtomicBoolean(false);
    private WebSocket socket;
    private volatile boolean stopping = false, sound = true;
    private String url, token;
    private final PendingOrders pendingOrders = new PendingOrders();
    private boolean ringing = false;
    private int retries = 0;
    private final Runnable reconnectTask = this::connect;
    private long lastUnreadMessageId = 0;
    private ToneGenerator tone;
    private ToneGenerator orderTone;
    private OrderVolumeBoost orderVolume;
    private boolean alternateAlarm = false;
    private final Runnable ring = new Runnable() {
        @Override public void run() {
            if (stopping) return;
            if (pendingOrders.count() == 0 || !sound) { ringing = false; if (orderTone != null) orderTone.stopTone(); return; }
            if (orderTone != null) syncOrderVolume(true);
            // Urgent alternating alert, with only a short gap between pulses.
            // 100 is full generator gain, NOT a change to the device's volume or DND.
            if (orderTone != null) {
                orderTone.startTone(alternateAlarm
                    ? ToneGenerator.TONE_SUP_ERROR
                    : ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 950);
                alternateAlarm = !alternateAlarm;
            }
            handler.postDelayed(this, 1000);
        }
    };
    private final Runnable poll = new Runnable() {
        @Override public void run() {
            if (stopping) return;
            refresh();
            handler.postDelayed(this, 15000);
        }
    };
    @Override public void onCreate() {
        super.onCreate();
        instance = this;
        orderVolume = OrderAlarmVolume.create(this);
        syncOrderVolume(false); // Recover a prior temporary boost after process death.
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel monitor = new NotificationChannel("basket-monitor", "اتصال كاشير السلة", NotificationManager.IMPORTANCE_LOW);
            manager.createNotificationChannel(monitor);
            NotificationChannel orders = new NotificationChannel("basket-pending", "طلبات تحتاج القبول", NotificationManager.IMPORTANCE_HIGH);
            orders.setSound(null, null);
            manager.createNotificationChannel(orders);
            NotificationChannel messages = new NotificationChannel("basket-messages", "رسائل العملاء", NotificationManager.IMPORTANCE_HIGH);
            manager.createNotificationChannel(messages);
        }
        try { tone = new ToneGenerator(AudioManager.STREAM_NOTIFICATION, 80); } catch (Exception ignored) {}
        try { orderTone = new ToneGenerator(AudioManager.STREAM_NOTIFICATION, 100); }
        catch (Exception error) { Log.e("BasketOrderAlarm", "Could not initialize the pending-order alarm", error); }
    }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            url = intent.getStringExtra("url");
            sound = intent.getBooleanExtra("sound", true);
            getSharedPreferences("basket_monitor", MODE_PRIVATE).edit().putString("url", url).putBoolean("sound", sound).apply();
        } else {
            url = getSharedPreferences("basket_monitor", MODE_PRIVATE).getString("url", null);
            sound = getSharedPreferences("basket_monitor", MODE_PRIVATE).getBoolean("sound", true);
        }
        try { token = SecureSession.get(this); } catch (Exception error) { stopSelf(); return START_NOT_STICKY; }
        if (token == null || url == null || !url.matches("https://[^/]+/basket-merchant")) { stopSelf(); return START_NOT_STICKY; }
        Notification notification = notification("basket-monitor", "السلة للتاجر", "جارٍ الاتصال بالطلبات", true);
        if (Build.VERSION.SDK_INT >= 29) startForeground(1901, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        else startForeground(1901, notification);
        stopping = false;
        handler.removeCallbacks(poll);
        handler.post(poll);
        updatePendingAlert();
        connect();
        return START_STICKY;
    }

    /** UI snapshots and confirmed accepts update the same native alert state immediately. */
    public static void updatePendingOrders(long[] ids, Long acceptedId) {
        OrderMonitorService service = instance;
        if (service == null) return; // The next service poll recovers state if startup is still in progress.
        service.handler.post(() -> {
            if (service.stopping) return;
            if (acceptedId != null) service.pendingOrders.accept(acceptedId);
            if (ids != null) service.pendingOrders.replace(ids);
            service.updatePendingAlert();
        });
    }

    private void updatePendingAlert() {
        int count = pendingOrders.count();
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (count > 0) manager.notify(1902, notification("basket-pending", "طلب جديد يحتاج القبول", count + " طلبات بانتظار القبول — افتح التطبيق", true));
        else manager.cancel(1902);
        if (count == 0 || !sound) {
            handler.removeCallbacks(ring);
            ringing = false;
            alternateAlarm = false;
            if (orderTone != null) orderTone.stopTone();
            syncOrderVolume(false);
        } else if (!ringing) {
            ringing = true;
            handler.post(ring);
        }
    }
    private void syncOrderVolume(boolean active) {
        if (orderVolume == null) return;
        try { orderVolume.update(active, OrderAlarmVolume.percent(this)); }
        catch (Exception error) { Log.e("BasketOrderAlarm", "Could not adjust or restore order alert volume", error); }
    }
    static void refreshOrderVolume() {
        OrderMonitorService service = instance;
        if (service != null) service.handler.post(() ->
            service.syncOrderVolume(!service.stopping && service.orderTone != null && service.sound && service.pendingOrders.count() > 0));
    }
    private Notification notification(String channel, String title, String text, boolean ongoing) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent open = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, channel)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title).setContentText(text).setContentIntent(open)
            .setOngoing(ongoing).setOnlyAlertOnce(true).setAutoCancel(!ongoing)
            .setSilent(!sound || channel.equals("basket-monitor"))
            .setPriority(ongoing && channel.equals("basket-pending") ? NotificationCompat.PRIORITY_HIGH : NotificationCompat.PRIORITY_DEFAULT)
            .build();
    }
    private void connectionLabel(String value) {
        if (!stopping) getSystemService(NotificationManager.class).notify(1901, notification("basket-monitor", "السلة للتاجر", value, true));
    }
    private void connect() {
        if (stopping) return;
        WebSocket previous = socket;
        socket = null;
        if (previous != null) previous.cancel();
        Request request = new Request.Builder().url(url.replaceFirst("^https:", "wss:") + "/events")
            .header("Authorization", "Bearer " + token).build();
        socket = client.newWebSocket(request, new WebSocketListener() {
            @Override public void onOpen(WebSocket ws, Response response) { connected = true; retries = 0; handler.removeCallbacks(reconnectTask); connectionLabel("متصل — استقبال الطلبات مفعّل"); refresh(); }
            @Override public void onMessage(WebSocket ws, String text) { refresh(); }
            @Override public void onFailure(WebSocket ws, Throwable error, Response response) { if (ws == socket) reconnect(); }
            @Override public void onClosed(WebSocket ws, int code, String reason) { if (ws == socket) reconnect(); }
        });
    }
    private void reconnect() {
        connected = false;
        if (stopping) return;
        connectionLabel("انقطع الاتصال — جارٍ إعادة الاتصال؛ قد تكون البيانات قديمة");
        long delay = Math.min(30000, 1000L << Math.min(retries++, 5));
        handler.removeCallbacks(reconnectTask);
        handler.postDelayed(reconnectTask, delay);
    }
    private void refresh() {
        if (stopping || !fetching.compareAndSet(false, true)) return;
        client.newCall(new Request.Builder().url(url + "/api/merchant/state").header("Authorization", "Bearer " + token).build())
            .enqueue(new Callback() {
                @Override public void onFailure(Call call, IOException error) { connected = false; fetching.set(false); connectionLabel("لا يوجد اتصال — لن يتم تأكيد طلبات أثناء الانقطاع"); }
                @Override public void onResponse(Call call, Response response) {
                    try (Response result = response) {
                        if (result.code() == 401) {
                            connectionLabel("انتهت الجلسة — افتح التطبيق وسجّل الدخول مجددًا");
                            stopping = true;
                            stopSelf();
                            return;
                        }
                        if (!result.isSuccessful() || result.body() == null) { connectionLabel("تعذر تحديث الطلبات — راجع اتصال خدمة التاجر"); return; }
                        JSONObject state = new JSONObject(result.body().string());
                        connected = true;
                        JSONArray orders = state.getJSONArray("orders");
                        java.util.ArrayList<Long> pending = new java.util.ArrayList<>();
                        for (int i = 0; i < orders.length(); i++) {
                            JSONObject order = orders.getJSONObject(i);
                            if ("pending".equals(order.optString("status"))) pending.add(order.getLong("id"));
                        }
                        long[] ids = new long[pending.size()];
                        for (int i = 0; i < ids.length; i++) ids[i] = pending.get(i);
                        updatePendingOrders(ids, null);
                        NotificationManager manager = getSystemService(NotificationManager.class);
                        JSONArray messages = state.getJSONArray("messages");
                        long newest = 0;
                        for (int i = 0; i < messages.length(); i++) {
                            JSONObject message = messages.getJSONObject(i);
                            if (!message.optBoolean("fromCashier") && message.isNull("readAt")) newest = Math.max(newest, message.optLong("id"));
                        }
                        if (newest > lastUnreadMessageId) {
                            manager.notify(1903, notification("basket-messages", "رسالة جديدة من عميل", "افتح محادثة الطلب للرد", false));
                            if (sound && tone != null && pendingOrders.count() == 0) tone.startTone(ToneGenerator.TONE_PROP_ACK, 500);
                        }
                        if (newest == 0) manager.cancel(1903);
                        lastUnreadMessageId = newest;
                        connectionLabel("متصل — آخر تحديث " + new java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.ROOT).format(new java.util.Date()));
                    } catch (Exception error) { connectionLabel("تعذّر قراءة تحديث الطلبات — لم تستخدم بيانات بديلة"); }
                    finally { fetching.set(false); }
                }
            });
    }
    // Android 15 can impose a cumulative six-hour dataSync limit. Surface it, don't silently claim 24/7 delivery.
    @Override public void onTimeout(int startId, int fgsType) {
        connectionLabel("أوقف أندرويد متابعة الخلفية — افتح تطبيق السلة لاستئنافها");
        stopSelf();
    }
    @Override public void onDestroy() {
        if (instance == this) instance = null;
        connected = false;
        stopping = true;
        handler.removeCallbacksAndMessages(null);
        if (socket != null) socket.cancel();
        client.dispatcher().cancelAll();
        if (tone != null) tone.release();
        if (orderTone != null) orderTone.release();
        syncOrderVolume(false);
        getSystemService(NotificationManager.class).cancel(1902);
        getSystemService(NotificationManager.class).cancel(1903);
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
