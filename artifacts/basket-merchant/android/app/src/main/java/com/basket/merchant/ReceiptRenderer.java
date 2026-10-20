package com.basket.merchant;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.DashPathEffect;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextDirectionHeuristics;
import android.text.TextPaint;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.MultiFormatWriter;
import com.google.zxing.common.BitMatrix;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;

final class ReceiptRenderer {
    private static final class Block {
        String kind, style;
        StaticLayout right, left;
        int height, padding, rightX;
    }

    private static StaticLayout text(String value, int width, int paperWidth, String style, boolean left) throws Exception {
        if (value.length() > 2000) throw new Exception("سطر الفاتورة طويل جدًا");
        boolean prominent = "store".equals(style) || "total".equals(style);
        boolean centered = "store".equals(style) || "banner".equals(style) || "order".equals(style)
            || "date".equals(style) || "footer".equals(style);
        boolean bold = prominent || "banner".equals(style) || "order".equals(style) || "heading".equals(style);
        float size = prominent ? 30 : "order".equals(style) ? 27
            : ("date".equals(style) || "footer".equals(style)) ? 20 : 24;
        if (paperWidth == 80) size += 3;
        // Each layout retains its own paint: later bold/size changes cannot alter earlier rows.
        TextPaint paint = new TextPaint(TextPaint.ANTI_ALIAS_FLAG);
        paint.setColor(Color.BLACK);
        paint.setTextSize(size);
        paint.setTypeface(Typeface.create("sans-serif", bold ? Typeface.BOLD : Typeface.NORMAL));
        // Android shapes Arabic glyphs before rasterization; no printer codepage dependency.
        return StaticLayout.Builder.obtain(value, 0, value.length(), paint, width)
            .setAlignment(centered ? Layout.Alignment.ALIGN_CENTER
                : left ? Layout.Alignment.ALIGN_OPPOSITE : Layout.Alignment.ALIGN_NORMAL)
            .setTextDirection(TextDirectionHeuristics.RTL)
            .setLineSpacing(5, 1).setIncludePad(true).build();
    }

    static Bitmap render(JSONArray lines, JSONArray rows, String qr, int paperWidth) throws Exception {
        if (lines.length() > 500) throw new Exception("الفاتورة طويلة جدًا؛ قلّل عدد الأسطر");
        int width = paperWidth == 80 ? 576 : 384;
        int contentWidth = width - 24, qrSize = 160;
        if (rows == null || rows.length() == 0) {
            rows = new JSONArray();
            for (int i = 0; i < lines.length(); i++) rows.put(new JSONObject()
                .put("kind", "text").put("text", lines.getString(i)));
        }
        if (rows.length() > 500) throw new Exception("الفاتورة طويلة جدًا؛ قلّل عدد الأسطر");
        ArrayList<Block> blocks = new ArrayList<>();
        boolean hasQrRow = false;
        for (int i = 0; i < rows.length(); i++) {
            JSONObject row = rows.getJSONObject(i);
            Block block = new Block();
            block.kind = row.getString("kind");
            block.style = row.optString("style", "body");
            block.padding = 6;
            switch (block.kind) {
                case "divider":
                    block.height = 28;
                    break;
                case "qr":
                    hasQrRow = true;
                    if (qr == null || qr.isEmpty()) continue;
                    block.height = qrSize + 24;
                    break;
                case "columns":
                    int leftWidth = (contentWidth - 12) * 40 / 100;
                    block.rightX = leftWidth + 12;
                    block.right = text(row.getString("right"), contentWidth - block.rightX, paperWidth, "body", false);
                    block.left = text(row.getString("left"), leftWidth, paperWidth, "body", true);
                    block.height = Math.max(block.right.getHeight(), block.left.getHeight()) + 12;
                    break;
                case "text":
                    block.right = text(row.getString("text"), contentWidth, paperWidth, block.style, false);
                    block.padding = "total".equals(block.style) ? 12 : 6;
                    block.height = block.right.getHeight() + block.padding * 2;
                    break;
                default:
                    throw new Exception("تنسيق الفاتورة غير معروف");
            }
            blocks.add(block);
        }
        if (!hasQrRow && qr != null && !qr.isEmpty()) {
            Block block = new Block();
            block.kind = "qr"; block.height = qrSize + 24; blocks.add(block);
        }
        int height = 36;
        for (Block block : blocks) height += block.height;
        if (height > 30000) throw new Exception("الفاتورة تتجاوز حد الطباعة الآمن");
        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        canvas.drawColor(Color.WHITE);
        Paint separator = new Paint(Paint.ANTI_ALIAS_FLAG);
        separator.setColor(Color.BLACK);
        separator.setStrokeWidth(1.5f);
        separator.setPathEffect(new DashPathEffect(new float[]{9, 5}, 0));
        Paint band = new Paint();
        band.setColor(Color.rgb(235, 235, 235));
        int y = 12;
        try {
            for (Block block : blocks) {
                if ("divider".equals(block.kind)) {
                    canvas.drawLine(12, y + 14, width - 12, y + 14, separator);
                } else if ("qr".equals(block.kind)) {
                    BitMatrix matrix = new MultiFormatWriter().encode(qr, BarcodeFormat.QR_CODE, qrSize, qrSize);
                    Bitmap code = Bitmap.createBitmap(qrSize, qrSize, Bitmap.Config.ARGB_8888);
                    try {
                        for (int row = 0; row < qrSize; row++) for (int col = 0; col < qrSize; col++)
                            code.setPixel(col, row, matrix.get(col, row) ? Color.BLACK : Color.WHITE);
                        canvas.drawBitmap(code, (width - qrSize) / 2f, y + 12, null);
                    } finally { code.recycle(); }
                } else {
                    if ("banner".equals(block.style) || "order".equals(block.style) || "total".equals(block.style))
                        canvas.drawRect(12, y, width - 12, y + block.height, band);
                    canvas.save(); canvas.translate(12 + block.rightX, y + block.padding);
                    block.right.draw(canvas); canvas.restore();
                    if (block.left != null) {
                        canvas.save(); canvas.translate(12, y + block.padding);
                        block.left.draw(canvas); canvas.restore();
                    }
                }
                y += block.height;
            }
            return bitmap;
        } catch (Exception error) {
            bitmap.recycle(); throw error;
        }
    }
    /** GS v 0 raster strips, compatible with common ESC/POS 58/80mm printers. */
    static byte[] escpos(Bitmap bitmap, int copies) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        int width = bitmap.getWidth(), byteWidth = (width + 7) / 8;
        for (int copy = 0; copy < copies; copy++) {
            out.write(new byte[]{0x1b, 0x40});
            for (int top = 0; top < bitmap.getHeight(); top += 128) {
                int height = Math.min(128, bitmap.getHeight() - top);
                out.write(new byte[]{0x1d, 0x76, 0x30, 0, (byte)(byteWidth & 255), (byte)(byteWidth >> 8), (byte)height, 0});
                for (int row = 0; row < height; row++) for (int b = 0; b < byteWidth; b++) {
                    int value = 0;
                    for (int bit = 0; bit < 8; bit++) {
                        int x = b * 8 + bit;
                        if (x >= width) continue;
                        int pixel = bitmap.getPixel(x, top + row);
                        if ((Color.red(pixel) + Color.green(pixel) + Color.blue(pixel)) / 3 < 160) value |= 128 >> bit;
                    }
                    out.write(value);
                }
            }
            out.write(new byte[]{0x1b, 0x64, 4});
        }
        return out.toByteArray();
    }
}
