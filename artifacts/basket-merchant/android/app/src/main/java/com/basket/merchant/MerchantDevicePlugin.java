package com.basket.merchant;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothSocket;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.RemoteException;
import android.view.WindowManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.sunmi.peripheral.printer.InnerPrinterCallback;
import com.sunmi.peripheral.printer.InnerPrinterManager;
import com.sunmi.peripheral.printer.InnerResultCallback;
import com.sunmi.peripheral.printer.SunmiPrinterService;
import org.json.JSONArray;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name="MerchantDevice", permissions={
    @Permission(alias="bluetooth", strings={Manifest.permission.BLUETOOTH_CONNECT})
})
public class MerchantDevicePlugin extends Plugin {
    private final ExecutorService printerQueue = Executors.newSingleThreadExecutor();
    @PluginMethod public void saveSession(PluginCall call) {
        try {
            String token = call.getString("token");
            if (token == null || !token.matches("[A-Za-z0-9_-]{43}")) { call.reject("جلسة غير صالحة"); return; }
            SecureSession.save(getContext(), token); call.resolve();
        } catch (Exception error) { call.reject("تعذّر حفظ الجلسة بشكل آمن"); }
    }
    @PluginMethod public void getSession(PluginCall call) {
        try {
            JSObject result = new JSObject(); result.put("token", SecureSession.get(getContext())); call.resolve(result);
        } catch (Exception error) { SecureSession.clear(getContext()); call.reject("تعذّر فتح الجلسة؛ سجّل الدخول مجددًا"); }
    }
    @PluginMethod public void updatePendingOrders(PluginCall call) {
        try {
            JSONArray values = call.getArray("ids");
            long[] ids = null;
            if (values != null) {
                if (values.length() > 1000) throw new Exception();
                ids = new long[values.length()];
                for (int i = 0; i < ids.length; i++) {
                    ids[i] = values.getLong(i);
                    if (ids[i] <= 0) throw new Exception();
                }
            }
            Integer accepted = call.getInt("acceptedId");
            if (accepted != null && accepted <= 0) throw new Exception();
            OrderMonitorService.updatePendingOrders(ids, accepted == null ? null : accepted.longValue());
            call.resolve();
        } catch (Exception error) { call.reject("تعذّر تحديث تنبيه الطلبات"); }
    }
    @PluginMethod public void clearSession(PluginCall call) { SecureSession.clear(getContext()); call.resolve(); }
    @PluginMethod public void configure(PluginCall call) {
        boolean awake = Boolean.TRUE.equals(call.getBoolean("keepAwake", true));
        getActivity().runOnUiThread(() -> {
            if (awake) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            call.resolve();
        });
    }
    @PluginMethod public void startMonitoring(PluginCall call) {
        String url = call.getString("url", "");
        if (!url.matches("https://[^/]+/basket-merchant")) { call.reject("رابط خدمة التاجر غير صالح"); return; }
        Intent intent = new Intent(getContext(), OrderMonitorService.class);
        intent.putExtra("url", url);
        intent.putExtra("sound", Boolean.TRUE.equals(call.getBoolean("sound", true)));
        try {
            if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(intent);
            else getContext().startService(intent);
            call.resolve();
        } catch (Exception error) { call.reject("تعذّر تشغيل متابعة الطلبات بالخلفية؛ افتح التطبيق وحاول مجددًا"); }
    }
    @PluginMethod public void stopMonitoring(PluginCall call) {
        getContext().stopService(new Intent(getContext(), OrderMonitorService.class)); call.resolve();
    }
    @PluginMethod public void getMonitoringStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("connected", OrderMonitorService.connected);
        call.resolve(result);
    }
    @PluginMethod public void getOrderAlertVolume(PluginCall call) {
        JSObject result = new JSObject();
        result.put("percent", OrderAlarmVolume.percent(getContext()));
        call.resolve(result);
    }
    @PluginMethod public void setOrderAlertVolume(PluginCall call) {
        Integer percent = call.getInt("percent");
        if (percent == null || percent < 10 || percent > 100) {
            call.reject("اختر مستوى صوت بين 10 و100"); return;
        }
        try {
            OrderAlarmVolume.setPercent(getContext(), percent);
            OrderMonitorService.refreshOrderVolume();
            call.resolve();
        } catch (Exception error) { call.reject("تعذّر حفظ مستوى صوت الطلبات"); }
    }
    @PluginMethod public void detectPrinter(PluginCall call) {
        printerQueue.execute(() -> {
            JSObject result = new JSObject();
            result.put("manufacturer", Build.MANUFACTURER);
            result.put("model", Build.MODEL);
            result.put("paperWidth", 58);
            result.put("supported", false);
            result.put("transport", "none");
            // Probe the official SDK service, never assume support from a name.
            try (SunmiConnection connection = connectSunmi()) {
                result.put("supported", true);
                result.put("transport", "sunmi");
                int state = connection.printer.updatePrinterState();
                result.put("state", state);
                result.put("message", state == 1 ? "تم التعرف على طابعة SUNMI المدمجة — جاهزة"
                    : "تم التعرف على طابعة SUNMI؛ " + printerStateMessage(state));
            } catch (Exception error) {
                result.put("message", error.getMessage() == null ? "تعذّر الاتصال بخدمة طباعة SUNMI" : error.getMessage());
            }
            call.resolve(result);
        });
    }
    @PluginMethod public void printReceipt(PluginCall call) {
        if ("bluetooth".equals(call.getString("transport")) && Build.VERSION.SDK_INT >= 31 &&
            getPermissionState("bluetooth") != PermissionState.GRANTED) {
            requestPermissionForAlias("bluetooth", call, "bluetoothResult"); return;
        }
        printAuthorized(call);
    }
    @PermissionCallback private void bluetoothResult(PluginCall call) {
        if (getPermissionState("bluetooth") != PermissionState.GRANTED) { call.reject("يلزم السماح باتصال البلوتوث للطباعة"); return; }
        printAuthorized(call);
    }
    private void printAuthorized(PluginCall call) {
        printerQueue.execute(() -> {
            Bitmap bitmap = null;
            try {
                JSONArray lines = call.getArray("lines");
                int width = call.getInt("width", 58), copies = call.getInt("copies", 1);
                if (lines == null || (width != 58 && width != 80) || copies < 1 || copies > 5) throw new Exception("إعدادات الفاتورة غير صحيحة");
                bitmap = ReceiptRenderer.render(lines, call.getArray("rows"), call.getString("qr", ""), width);
                String transport = call.getString("transport", "none");
                String address = call.getString("address", "");
                if ("sunmi".equals(transport) || "vendor".equals(transport)) {
                    printSunmi(bitmap, copies);
                } else if ("tcp".equals(transport)) {
                    String[] parts = address.split(":");
                    int port = parts.length > 1 ? Integer.parseInt(parts[1]) : 9100;
                    // Only an explicit local-network printer address; no remote HTTP proxy.
                    boolean validIp = parts[0].matches("\\d{1,3}(\\.\\d{1,3}){3}");
                    if (validIp) for (String octet : parts[0].split("\\.")) if (Integer.parseInt(octet) > 255) validIp = false;
                    if (!validIp || !parts[0].matches("(10\\..*|192\\.168\\..*|172\\.(1[6-9]|2[0-9]|3[01])\\..*)") || port < 1 || port > 65535)
                        throw new Exception("أدخل عنوان IP محلي صحيح للطابعة");
                    try (Socket socket = new Socket()) {
                        Handler timeout = new Handler(Looper.getMainLooper());
                        Runnable close = () -> { try { socket.close(); } catch (Exception ignored) {} };
                        timeout.postDelayed(close, 30000);
                        try {
                        socket.connect(new InetSocketAddress(parts[0], port), 6000);
                        socket.setSoTimeout(15000);
                        socket.getOutputStream().write(ReceiptRenderer.escpos(bitmap, copies));
                        socket.getOutputStream().flush();
                        } finally { timeout.removeCallbacks(close); }
                    }
                } else if ("bluetooth".equals(transport)) {
                    BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
                    if (adapter == null || !adapter.isEnabled()) throw new Exception("شغّل البلوتوث أولًا");
                    if (!BluetoothAdapter.checkBluetoothAddress(address)) throw new Exception("عنوان MAC للطابعة غير صحيح");
                    BluetoothSocket socket = adapter.getRemoteDevice(address).createRfcommSocketToServiceRecord(UUID.fromString("00001101-0000-1000-8000-00805F9B34FB"));
                    final AtomicBoolean finished = new AtomicBoolean(false);
                    Handler timeout = new Handler(Looper.getMainLooper());
                    Runnable close = () -> { if (!finished.get()) try { socket.close(); } catch (Exception ignored) {} };
                    timeout.postDelayed(close, 20000);
                    try {
                        socket.connect();
                        socket.getOutputStream().write(ReceiptRenderer.escpos(bitmap, copies));
                        socket.getOutputStream().flush();
                    } finally { finished.set(true); timeout.removeCallbacks(close); socket.close(); }
                } else throw new Exception("الطابعة غير مدعومة؛ يلزم اختيار SUNMI المتوافقة أو ESC/POS عبر شبكة/بلوتوث");
                call.resolve();
            } catch (Exception error) {
                call.reject(error.getMessage() == null ? "فشلت الطباعة؛ تحقق من الورق والاتصال" : error.getMessage());
            } finally { if (bitmap != null) bitmap.recycle(); }
        });
    }
    private final class SunmiConnection implements AutoCloseable {
        final CountDownLatch bound = new CountDownLatch(1);
        volatile SunmiPrinterService printer;
        final InnerPrinterCallback callback = new InnerPrinterCallback() {
            @Override protected void onConnected(SunmiPrinterService service) { printer = service; bound.countDown(); }
            @Override protected void onDisconnected() { printer = null; bound.countDown(); }
        };
        @Override public void close() {
            try { InnerPrinterManager.getInstance().unBindService(getContext(), callback); } catch (Exception ignored) { }
        }
    }
    private SunmiConnection connectSunmi() throws Exception {
        SunmiConnection connection = new SunmiConnection();
        try {
            boolean accepted = InnerPrinterManager.getInstance().bindService(getContext(), connection.callback);
            if (!accepted || !connection.bound.await(6, TimeUnit.SECONDS) || connection.printer == null)
                throw new Exception("خدمة طابعة SUNMI غير متاحة؛ تحقق من تشغيل خدمة الطباعة على الجهاز");
            return connection;
        } catch (Exception error) { connection.close(); throw error; }
    }
    private String printerStateMessage(int status) {
        switch (status) {
            case 1: return "الطابعة جاهزة";
            case 2: return "الطابعة تستعد؛ حاول مجددًا بعد لحظة";
            case 3: return "تعذّر الاتصال بالطابعة";
            case 4: return "نفد الورق؛ ضع ورقًا حراريًا 58 مم";
            case 5: return "حرارة الطابعة مرتفعة؛ انتظر قليلًا";
            case 6: return "أغلق غطاء الطابعة";
            default: return "الطابعة ليست جاهزة؛ رمز الحالة " + status;
        }
    }
    private void printSunmi(Bitmap bitmap, int copies) throws Exception {
        try (SunmiConnection connection = connectSunmi()) {
            SunmiPrinterService printer = connection.printer;
            int status = printer.updatePrinterState();
            if (status != 1) throw new Exception(printerStateMessage(status));
            for (int copy = 0; copy < copies; copy++) {
                CountDownLatch printed = new CountDownLatch(1);
                String[] error = {null};
                printer.enterPrinterBuffer(true);
                printer.printBitmap(bitmap, null);
                printer.lineWrap(4, null);
                printer.exitPrinterBufferWithCallback(true, new InnerResultCallback() {
                    @Override public void onRunResult(boolean success) {}
                    @Override public void onReturnString(String result) {}
                    @Override public void onRaiseException(int code, String message) { error[0] = "خطأ طباعة " + code; printed.countDown(); }
                    @Override public void onPrintResult(int code, String message) { if (code != 0) error[0] = "لم تكتمل الطباعة؛ الرمز " + code; printed.countDown(); }
                });
                if (!printed.await(30, TimeUnit.SECONDS)) throw new Exception("لم تؤكد الطابعة اكتمال الطباعة؛ تحقق من الورقة قبل إعادة الطباعة لتجنب تكرارها");
                if (error[0] != null) throw new Exception(error[0]);
            }
        }
    }
    @Override protected void handleOnDestroy() { printerQueue.shutdownNow(); }
}
