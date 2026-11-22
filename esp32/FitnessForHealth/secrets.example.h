// Vorlage: Diese Datei nach "secrets.h" kopieren und die Werte eintragen.
// secrets.h wird nicht ins Git-Repository übernommen.
#pragma once

// WLAN, mit dem sich der ESP32 verbindet (nur 2,4 GHz)
#define WIFI_SSID "MeinWLAN"
#define WIFI_PASSWORD "MeinWLANPasswort"

// Gerätename im Netzwerk: Die App ist dann unter http://fitness.local erreichbar
#define DEVICE_NAME "fitness"

// Passwort für die App. Leer lassen ("") = ohne Anmeldung nutzbar.
#define APP_PASSWORD ""

// Anzeigename beim ersten Start (später in den Einstellungen änderbar)
#define USER_NAME "Ich"

// Optional: feste IP-Adresse statt DHCP (Zeilen einkommentieren und anpassen)
// #define STATIC_IP 192, 168, 178, 50
// #define STATIC_GATEWAY 192, 168, 178, 1
// #define STATIC_SUBNET 255, 255, 255, 0
// #define STATIC_DNS 192, 168, 178, 1
