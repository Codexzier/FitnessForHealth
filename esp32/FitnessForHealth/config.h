#pragma once

#if defined(FFH_HOST)
// Host-Simulation (esp32/host): keine WLAN-Daten nötig
#define WIFI_SSID "host"
#ifndef APP_PASSWORD
#define APP_PASSWORD ""
#endif
#elif __has_include("secrets.h")
#include "secrets.h"
#else
#error "secrets.h fehlt: Bitte secrets.example.h nach secrets.h kopieren und WLAN-Daten eintragen."
#endif

#ifndef WIFI_SSID
#error "WIFI_SSID ist in secrets.h nicht gesetzt."
#endif
#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD ""
#endif
#ifndef DEVICE_NAME
#define DEVICE_NAME "fitness"
#endif
#ifndef APP_PASSWORD
#define APP_PASSWORD ""
#endif
#ifndef USER_NAME
#define USER_NAME "Ich"
#endif

#define FFH_VERSION "1.0.0"
