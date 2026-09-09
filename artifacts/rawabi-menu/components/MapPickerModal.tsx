import React, { useRef, useState } from "react";
import {
  Modal, View, Text, TouchableOpacity,
  ActivityIndicator, StyleSheet, Platform,
} from "react-native";
import { WebView } from "react-native-webview";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

interface Props {
  visible: boolean;
  initialLat?: number;
  initialLng?: number;
  onConfirm: (lat: number, lng: number, url: string) => void;
  onClose: () => void;
}

const TABUK_LAT = 28.3998;
const TABUK_LNG = 36.5717;

function buildMapHtml(lat: number, lng: number) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body, #map { width:100%; height:100%; overflow:hidden; }
  #hint {
    position:fixed; bottom:16px; left:50%; transform:translateX(-50%);
    background:rgba(0,0,0,0.72); color:#fff;
    padding:8px 18px; border-radius:20px;
    font-size:14px; font-family:sans-serif; text-align:center;
    pointer-events:none; z-index:9999; white-space:nowrap;
    direction:rtl;
  }
  #coords {
    position:fixed; top:10px; left:50%; transform:translateX(-50%);
    background:rgba(0,0,0,0.65); color:#E8920C;
    padding:5px 14px; border-radius:14px;
    font-size:12px; font-family:monospace; text-align:center;
    z-index:9999; white-space:nowrap;
  }
</style>
</head>
<body>
<div id="map"></div>
<div id="coords">اضغط لتحديد موقعك</div>
<div id="hint">📍 اضغط على الخريطة لتحديد موقعك بدقة</div>
<script>
  var map = L.map('map', { zoomControl: true, attributionControl: false })
              .setView([${lat}, ${lng}], 16);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

  var redIcon = L.divIcon({
    className: '',
    html: '<div style="width:28px;height:28px;background:#C8171A;border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,0.5)"></div>',
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });

  var marker = L.marker([${lat}, ${lng}], { icon: redIcon, draggable: true }).addTo(map);

  var curLat = ${lat}, curLng = ${lng};

  function update(lat, lng) {
    curLat = lat; curLng = lng;
    document.getElementById('coords').textContent =
      lat.toFixed(6) + ' , ' + lng.toFixed(6);
    sendCoords(lat, lng);
  }

  function sendCoords(lat, lng) {
    var msg = JSON.stringify({ type: 'coords', lat: lat, lng: lng });
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(msg);
    }
  }

  marker.on('dragend', function(e) {
    var p = e.target.getLatLng();
    update(p.lat, p.lng);
  });

  map.on('click', function(e) {
    marker.setLatLng(e.latlng);
    map.panTo(e.latlng);
    update(e.latlng.lat, e.latlng.lng);
    document.getElementById('hint').style.display = 'none';
  });

  update(${lat}, ${lng});
</script>
</body>
</html>`;
}

export function MapPickerModal({ visible, initialLat, initialLng, onConfirm, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const lat = initialLat ?? TABUK_LAT;
  const lng = initialLng ?? TABUK_LNG;

  const [pickedLat, setPickedLat] = useState(lat);
  const [pickedLng, setPickedLng] = useState(lng);
  const [mapReady, setMapReady] = useState(false);
  const webRef = useRef<WebView>(null);

  const html = buildMapHtml(lat, lng);

  const handleMessage = (e: any) => {
    try {
      const data = JSON.parse(e.nativeEvent.data);
      if (data.type === "coords") {
        setPickedLat(data.lat);
        setPickedLng(data.lng);
      }
    } catch {}
  };

  const handleConfirm = () => {
    const url = `https://maps.google.com/?q=${pickedLat},${pickedLng}`;
    onConfirm(pickedLat, pickedLng, url);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[s.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        {/* Header */}
        <View style={[s.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <Feather name="x" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[s.title, { color: colors.foreground, fontFamily: "Cairo_700Bold" }]}>
            📍 حدد موقعك على الخريطة
          </Text>
          <View style={{ width: 38 }} />
        </View>

        {/* Hint bar */}
        <View style={[s.hintBar, { backgroundColor: "#1A2A0A" }]}>
          <Feather name="info" size={13} color="#81C784" />
          <Text style={{ color: "#81C784", fontFamily: "Cairo_400Regular", fontSize: 12, flex: 1, textAlign: "right" }}>
            اضغط في أي مكان على الخريطة لضبط دبوسك، أو اسحب الدبوس الأحمر
          </Text>
        </View>

        {/* Map */}
        <View style={{ flex: 1, position: "relative" }}>
          {!mapReady && (
            <View style={s.loadingOverlay}>
              <ActivityIndicator size="large" color={colors.gold} />
              <Text style={{ color: colors.mutedForeground, marginTop: 10, fontFamily: "Cairo_400Regular" }}>جارٍ تحميل الخريطة...</Text>
            </View>
          )}
          <WebView
            ref={webRef}
            source={{ html }}
            style={{ flex: 1 }}
            onLoadEnd={() => setMapReady(true)}
            onMessage={handleMessage}
            javaScriptEnabled
            domStorageEnabled
            allowsInlineMediaPlayback
            mixedContentMode="always"
            originWhitelist={["*"]}
          />
        </View>

        {/* Confirm button */}
        <View style={[s.footer, { backgroundColor: colors.card, paddingBottom: insets.bottom + 12, borderTopColor: colors.border }]}>
          <View style={{ alignItems: "center", marginBottom: 10 }}>
            <Text style={{ color: colors.gold, fontFamily: "Cairo_600SemiBold", fontSize: 12 }}>
              {pickedLat.toFixed(6)}  ،  {pickedLng.toFixed(6)}
            </Text>
          </View>
          <TouchableOpacity onPress={handleConfirm} style={[s.confirmBtn, { backgroundColor: colors.primary }]} activeOpacity={0.85}>
            <Feather name="check-circle" size={18} color="#fff" />
            <Text style={{ color: "#fff", fontFamily: "Cairo_700Bold", fontSize: 16 }}>
              تأكيد الموقع
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    justifyContent: "space-between",
  },
  closeBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 16 },
  hintBar: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F0A05",
    zIndex: 10,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  confirmBtn: {
    backgroundColor: "#C8171A",
    borderRadius: 14,
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
});
