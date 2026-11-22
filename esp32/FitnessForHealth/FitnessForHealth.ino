// FitnessForHealth – schlanke Variante für den ESP32-C6
// Ein Benutzer, keine Bilder. Das Frontend ist in der Firmware enthalten,
// die Daten liegen im internen Flash (LittleFS) und überstehen Neustarts und Updates.
//
// Einrichtung: secrets.example.h nach secrets.h kopieren und WLAN eintragen.
// Board: "ESP32C6 Dev Module", Partition Scheme: siehe esp32/README.md
//
// Der Programmcode liegt in main.cpp (Start/WLAN), api.cpp (REST-API) und store.cpp (Speicher).
// Diese Datei bleibt bewusst leer, damit die Arduino-IDE den Sketch-Ordner erkennt.
