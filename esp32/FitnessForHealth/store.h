#pragma once
// Datenhaltung auf LittleFS. Kleine Sammlungen liegen als JSON-Array in je einer Datei,
// der Verlauf als JSON-Lines (eine Zeile pro Einheit), damit er nie komplett in den RAM muss.
#include <Arduino.h>
#include <vector>
#include "jsonutil.h"

#define F_EXERCISES "/exercises.json"
#define F_STRETCH_EXERCISES "/stretch_exercises.json"
#define F_WORKOUTS "/workouts.json"
#define F_STRETCHINGS "/stretchings.json"
#define F_ACTIVITIES "/activities.json"
#define F_PLANS "/plans.json"
#define F_EXECUTIONS "/executions.jsonl"

bool storeBegin();

/** Lädt ein JSON-Array (leeres Array, wenn die Datei fehlt) */
JPtr loadArray(const char *path);
/** Speichert sicher über eine temporäre Datei */
bool saveJson(const char *path, const cJSON *json);

/** Einstellungen (Name, Theme, Farbmodus) und ID-Zähler */
cJSON *meta();
bool saveMeta();
/** Neue eindeutige ID. Mit persist=false muss danach saveMeta() aufgerufen werden. */
int nextId(bool persist = true);

// ---------- Verlauf ----------

struct ExecIndex {
  int64_t key;      // Startzeit in Sekunden
  uint32_t offset;  // Position der Zeile in der Datei
};

/** Alle Verlaufszeilen, neueste zuerst */
std::vector<ExecIndex> executionIndex();
/** Liest die Zeile an einer Position */
String readExecutionLine(uint32_t offset);
bool appendExecution(const cJSON *exec);
bool deleteExecution(int id);
/** Kennungen (Typ|Name|Start) aller Einträge, sortiert – für das Überspringen beim Import */
std::vector<uint32_t> executionHashes();
uint32_t executionHash(const char *kind, const char *name, const char *startedAt);

size_t fsUsedBytes();
size_t fsTotalBytes();
