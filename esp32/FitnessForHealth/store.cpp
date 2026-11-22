#include "store.h"
#include <LittleFS.h>
#include <algorithm>
#include "config.h"
#include "dates.h"

static JPtr metaDoc;

static JPtr readFile(const char *path) {
  if (!LittleFS.exists(path)) return JPtr();
  File f = LittleFS.open(path, "r");
  if (!f) return JPtr();
  String content = f.readString();
  f.close();
  return JPtr(cJSON_Parse(content.c_str()));
}

JPtr loadArray(const char *path) {
  JPtr j = readFile(path);
  if (!j || !cJSON_IsArray(j.get())) return JPtr(cJSON_CreateArray());
  return j;
}

bool saveJson(const char *path, const cJSON *json) {
  char *text = cJSON_PrintUnformatted(json);
  if (!text) return false;
  String tmp = String(path) + ".tmp";
  File f = LittleFS.open(tmp, "w");
  bool ok = f && f.print(text) == strlen(text);
  if (f) f.close();
  free(text);
  if (!ok) {
    LittleFS.remove(tmp);
    return false;
  }
  if (!LittleFS.rename(tmp, path)) {
    LittleFS.remove(path);
    ok = LittleFS.rename(tmp, path);
  }
  return ok;
}

cJSON *meta() { return metaDoc.get(); }

bool saveMeta() { return saveJson("/meta.json", metaDoc.get()); }

int nextId(bool persist) {
  int id = jInt(metaDoc.get(), "nextId", 1);
  jSetInt(metaDoc.get(), "nextId", id + 1);
  if (persist) saveMeta();
  return id;
}

bool storeBegin() {
  // Beim ersten Start (oder bei defektem Dateisystem) wird LittleFS formatiert
  if (!LittleFS.begin(true)) return false;
  metaDoc = readFile("/meta.json");
  if (!metaDoc || !cJSON_IsObject(metaDoc.get())) {
    metaDoc.reset(cJSON_CreateObject());
    jSetInt(metaDoc.get(), "nextId", 1);
    jSetStr(metaDoc.get(), "name", USER_NAME);
    jSetStr(metaDoc.get(), "theme", "standard");
    jSetStr(metaDoc.get(), "colorMode", "system");
    saveMeta();
  }
  // „Laufen“ ist als Aktivität immer vorhanden
  if (!LittleFS.exists(F_ACTIVITIES)) {
    JPtr acts(cJSON_CreateArray());
    cJSON *run = cJSON_CreateObject();
    jSetInt(run, "id", nextId());
    jSetStr(run, "name", "Laufen");
    jSetStr(run, "icon", "🏃");
    cJSON_AddItemToArray(acts.get(), run);
    saveJson(F_ACTIVITIES, acts.get());
  }
  return true;
}

// ---------- Verlauf ----------

std::vector<ExecIndex> executionIndex() {
  std::vector<ExecIndex> idx;
  File f = LittleFS.open(F_EXECUTIONS, "r");
  if (!f) return idx;
  while (f.available()) {
    uint32_t offset = f.position();
    String line = f.readStringUntil('\n');
    if (line.length() < 2) continue;
    // Startzeit direkt aus dem Text lesen, ohne die Zeile zu parsen
    int p = line.indexOf("\"startedAt\":\"");
    int64_t key = p >= 0 ? isoKey(line.c_str() + p + 13) : 0;
    idx.push_back({key, offset});
  }
  f.close();
  // neueste zuerst; bei gleicher Zeit der später gespeicherte Eintrag zuerst
  std::sort(idx.begin(), idx.end(), [](const ExecIndex &a, const ExecIndex &b) {
    return a.key != b.key ? a.key > b.key : a.offset > b.offset;
  });
  return idx;
}

String readExecutionLine(uint32_t offset) {
  File f = LittleFS.open(F_EXECUTIONS, "r");
  if (!f) return String();
  f.seek(offset);
  String line = f.readStringUntil('\n');
  f.close();
  return line;
}

bool appendExecution(const cJSON *exec) {
  char *text = cJSON_PrintUnformatted(exec);
  if (!text) return false;
  File f = LittleFS.open(F_EXECUTIONS, "a");
  bool ok = f && f.print(text) == strlen(text) && f.print('\n') == 1;
  if (f) f.close();
  free(text);
  return ok;
}

bool deleteExecution(int id) {
  File in = LittleFS.open(F_EXECUTIONS, "r");
  if (!in) return false;
  File out = LittleFS.open("/executions.tmp", "w");
  if (!out) {
    in.close();
    return false;
  }
  bool found = false;
  String needle = String("{\"id\":") + id + ",";
  while (in.available()) {
    String line = in.readStringUntil('\n');
    if (line.length() < 2) continue;
    if (!found && line.startsWith(needle)) {
      found = true;
      continue;
    }
    out.print(line);
    out.print('\n');
  }
  in.close();
  out.close();
  if (!found) {
    LittleFS.remove("/executions.tmp");
    return false;
  }
  LittleFS.remove(F_EXECUTIONS);
  return LittleFS.rename("/executions.tmp", F_EXECUTIONS);
}

uint32_t executionHash(const char *kind, const char *name, const char *startedAt) {
  // FNV-1a über "Typ|Name|Start"
  uint32_t h = 2166136261u;
  auto mix = [&h](const char *s) {
    for (; s && *s; s++) {
      h ^= (uint8_t)*s;
      h *= 16777619u;
    }
    h ^= '|';
    h *= 16777619u;
  };
  mix(kind);
  mix(name);
  mix(startedAt);
  return h;
}

std::vector<uint32_t> executionHashes() {
  std::vector<uint32_t> hashes;
  File f = LittleFS.open(F_EXECUTIONS, "r");
  if (!f) return hashes;
  while (f.available()) {
    String line = f.readStringUntil('\n');
    if (line.length() < 2) continue;
    JPtr e(cJSON_Parse(line.c_str()));
    if (e) hashes.push_back(executionHash(jStr(e.get(), "kind", ""), jStr(e.get(), "name", ""), jStr(e.get(), "startedAt", "")));
  }
  f.close();
  std::sort(hashes.begin(), hashes.end());
  return hashes;
}

size_t fsUsedBytes() { return LittleFS.usedBytes(); }
size_t fsTotalBytes() { return LittleFS.totalBytes(); }
