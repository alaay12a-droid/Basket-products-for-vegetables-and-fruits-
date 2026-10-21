import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import type { PickerBranch } from "./BranchPickerModal";

interface Props {
  branches: PickerBranch[];
  selected: PickerBranch | null;
  userLat?: number | null;
  userLng?: number | null;
  onSelect: (branch: PickerBranch) => void;
  isEn: boolean;
  textColor: string;
  backgroundColor: string;
  fontFamily: string;
}

// Use the same WebView/Leaflet approach as the existing delivery map.
// Android's native Google Map requires a Maps SDK key in the installed binary.
export function buildAndroidBranchMapHtml(
  branches: PickerBranch[],
  userLat?: number | null,
  userLng?: number | null,
): string {
  const points = branches.filter(b =>
    typeof b.lat === "number" && Number.isFinite(b.lat) && Math.abs(b.lat) <= 90 &&
    typeof b.lng === "number" && Number.isFinite(b.lng) && Math.abs(b.lng) <= 180,
  ).map(b => ({ id: b.id, name: b.name, lat: b.lat, lng: b.lng }));
  const user = typeof userLat === "number" && Number.isFinite(userLat) && Math.abs(userLat) <= 90 &&
    typeof userLng === "number" && Number.isFinite(userLng) && Math.abs(userLng) <= 180
    ? { lat: userLat, lng: userLng } : null;
  const data = JSON.stringify({ points, user }).replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

  return `<!doctype html>
<html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>html,body,#map{height:100%;width:100%;margin:0} .leaflet-tooltip{font-family:sans-serif}</style>
</head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(function() {
  function send(message) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(message));
  }
  try {
    var data = ${data};
    var center = data.points[0] || { lat: 23.8859, lng: 45.0792 };
    var map = L.map('map').setView([center.lat, center.lng], data.points.length ? 13 : 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    var markers = {};
    data.points.forEach(function(branch) {
      var label = document.createElement('span');
      label.textContent = branch.name;
      var marker = L.circleMarker([branch.lat, branch.lng], {
        radius: 10, color: '#fff', weight: 3, fillColor: '#999', fillOpacity: 1
      }).addTo(map).bindTooltip(label);
      marker.on('click', function() { send({ type: 'select', id: branch.id }); });
      markers[branch.id] = marker;
    });
    if (data.user) L.circleMarker([data.user.lat, data.user.lng], {
      radius: 6, color: '#fff', weight: 2, fillColor: '#2474dd', fillOpacity: 1
    }).addTo(map);
    window.selectBranch = function(id) {
      Object.keys(markers).forEach(function(key) {
        markers[key].setStyle({ fillColor: String(id) === key ? '#E8920C' : '#999' });
      });
      if (markers[id]) map.setView(markers[id].getLatLng(), 15);
    };
    send({ type: 'ready' });
  } catch (_) { send({ type: 'error' }); }
})();
</script></body></html>`;
}

export default function AndroidBranchMap({
  branches, selected, userLat, userLng, onSelect, isEn,
  textColor, backgroundColor, fontFamily,
}: Props) {
  const webRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const html = useMemo(
    () => buildAndroidBranchMapHtml(branches, userLat, userLng),
    [branches, userLat, userLng],
  );
  const source = useMemo(() => ({ html }), [html]);

  useEffect(() => {
    setReady(false);
    setFailed(false);
  }, [html]);

  useEffect(() => {
    if (ready || failed) return;
    const timer = setTimeout(() => setFailed(true), 10000);
    return () => clearTimeout(timer);
  }, [html, ready, failed]);

  useEffect(() => {
    if (ready) {
      webRef.current?.injectJavaScript(
        `window.selectBranch && window.selectBranch(${JSON.stringify(selected?.id ?? null)});true;`,
      );
    }
  }, [ready, selected?.id]);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message.type === "ready") setReady(true);
      else if (message.type === "error") setFailed(true);
      else if (message.type === "select" && typeof message.id === "number") {
        const branch = branches.find(b => b.id === message.id);
        if (branch) onSelect(branch);
      }
    } catch {
      // Ignore malformed messages; branch selection remains available below.
    }
  };

  return (
    <View style={[styles.container, { backgroundColor }]}>
      {!failed && (
        <WebView
          ref={webRef}
          source={source}
          style={styles.container}
          javaScriptEnabled
          originWhitelist={["about:*"]}
          onShouldStartLoadWithRequest={request => request.url === "about:blank" || request.url === "about:srcdoc"}
          onMessage={handleMessage}
          onError={() => setFailed(true)}
          onHttpError={() => setFailed(true)}
          onRenderProcessGone={() => setFailed(true)}
        />
      )}
      {(!ready || failed) && (
        <View pointerEvents="none" style={[styles.status, { backgroundColor }]}>
          {!failed && <ActivityIndicator color={textColor} />}
          <Text style={{ color: textColor, fontFamily, textAlign: "center", marginTop: 10 }}>
            {failed
              ? (isEn ? "Map unavailable. Choose a branch from the list below." : "تعذر تحميل الخريطة. اختر الفرع من القائمة أدناه.")
              : (isEn ? "Loading map…" : "جارٍ تحميل الخريطة…")}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  status: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: 24 },
});
