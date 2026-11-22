// Start, WLAN und Hauptschleife
#include <Arduino.h>
#include <ESPmDNS.h>
#include <WebServer.h>
#include <WiFi.h>
#include "api.h"
#include "config.h"
#include "store.h"

WebServer server(80);
static unsigned long lastWifiCheck = 0;

static void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.setHostname(DEVICE_NAME);
  WiFi.setAutoReconnect(true);
#ifdef STATIC_IP
  WiFi.config(IPAddress(STATIC_IP), IPAddress(STATIC_GATEWAY), IPAddress(STATIC_SUBNET), IPAddress(STATIC_DNS));
#endif
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("Verbinde mit WLAN \"%s\"", WIFI_SSID);
  for (int i = 0; i < 60 && WiFi.status() != WL_CONNECTED; i++) {
    delay(500);
    Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("Verbunden. App: http://%s/  oder  http://%s.local/\n", WiFi.localIP().toString().c_str(), DEVICE_NAME);
  } else {
    Serial.println("WLAN-Verbindung fehlgeschlagen – neuer Versuch läuft im Hintergrund.");
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.printf("\nFitnessForHealth %s (ESP32-C6)\n", FFH_VERSION);

  if (!storeBegin()) {
    Serial.println("FEHLER: Dateisystem (LittleFS) nicht verfügbar. Partition Scheme prüfen!");
  }
  Serial.printf("Speicher: %u von %u Bytes belegt\n", (unsigned)fsUsedBytes(), (unsigned)fsTotalBytes());

  connectWifi();

  // Uhrzeit per NTP (für Dateinamen beim Export); Zeitzone Deutschland
  configTzTime("CET-1CEST,M3.5.0,M10.5.0/3", "pool.ntp.org", "time.cloudflare.com");

  if (MDNS.begin(DEVICE_NAME)) MDNS.addService("http", "tcp", 80);

  apiBegin(server);
  server.begin();
  Serial.println("Webserver gestartet.");
}

void loop() {
  server.handleClient();
  // WLAN regelmäßig prüfen und bei Bedarf neu verbinden
  if (millis() - lastWifiCheck > 10000) {
    lastWifiCheck = millis();
    if (WiFi.status() != WL_CONNECTED) WiFi.reconnect();
  }
  delay(2);
}
