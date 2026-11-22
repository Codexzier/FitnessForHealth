# Host-Simulation der ESP32-Firmware: kompiliert api.cpp und store.cpp für Linux/macOS,
# damit die Firmware-Logik ohne Hardware getestet werden kann.
# Voraussetzung: g++ und cJSON (Debian/Ubuntu: apt install libcjson-dev)

SKETCH = ../FitnessForHealth
CXXFLAGS = -std=gnu++17 -O1 -g -Wall -Wno-unused-function -DFFH_HOST -I. -I$(SKETCH) -I/usr/include/cjson $(EXTRA)
SOURCES = host.cpp $(SKETCH)/api.cpp $(SKETCH)/store.cpp

ffh-host: $(SOURCES) $(wildcard $(SKETCH)/*.h) $(wildcard *.h)
	$(CXX) $(CXXFLAGS) -o $@ $(SOURCES) -lcjson

run: ffh-host
	./ffh-host 8096

clean:
	rm -rf ffh-host data-host

.PHONY: run clean
