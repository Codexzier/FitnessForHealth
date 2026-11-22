#pragma once
// Kleine Hilfen rund um cJSON (ist im ESP32-Core enthalten, keine Zusatzbibliothek nötig).
#include <Arduino.h>
#include <math.h>
#include <memory>
#include "cJSON.h"

struct JsonDeleter {
  void operator()(cJSON *p) const { cJSON_Delete(p); }
};
using JPtr = std::unique_ptr<cJSON, JsonDeleter>;

inline cJSON *jget(const cJSON *o, const char *key) { return o ? cJSON_GetObjectItemCaseSensitive(o, key) : nullptr; }

inline bool jIsNull(const cJSON *o, const char *key) {
  cJSON *v = jget(o, key);
  return !v || cJSON_IsNull(v);
}

inline bool jIsInt(const cJSON *v) { return cJSON_IsNumber(v) && floor(v->valuedouble) == v->valuedouble; }

inline int jInt(const cJSON *o, const char *key, int def = 0) {
  cJSON *v = jget(o, key);
  return cJSON_IsNumber(v) ? (int)v->valuedouble : def;
}

inline double jNum(const cJSON *o, const char *key, double def = 0) {
  cJSON *v = jget(o, key);
  return cJSON_IsNumber(v) ? v->valuedouble : def;
}

inline const char *jStr(const cJSON *o, const char *key, const char *def = nullptr) {
  cJSON *v = jget(o, key);
  return cJSON_IsString(v) ? v->valuestring : def;
}

inline bool jBool(const cJSON *o, const char *key, bool def = false) {
  cJSON *v = jget(o, key);
  return cJSON_IsBool(v) ? cJSON_IsTrue(v) : def;
}

/** Setzt/ersetzt einen Wert in einem Objekt (übernimmt den Besitz von value). */
inline void jSet(cJSON *o, const char *key, cJSON *value) {
  if (cJSON_GetObjectItemCaseSensitive(o, key)) cJSON_ReplaceItemInObjectCaseSensitive(o, key, value);
  else cJSON_AddItemToObject(o, key, value);
}
inline void jSetInt(cJSON *o, const char *key, int v) { jSet(o, key, cJSON_CreateNumber(v)); }
inline void jSetStr(cJSON *o, const char *key, const char *v) { jSet(o, key, cJSON_CreateString(v)); }
inline void jSetBool(cJSON *o, const char *key, bool v) { jSet(o, key, cJSON_CreateBool(v)); }
inline void jSetNull(cJSON *o, const char *key) { jSet(o, key, cJSON_CreateNull()); }
/** Zahl oder null */
inline void jSetIdOrNull(cJSON *o, const char *key, int id) {
  if (id > 0) jSetInt(o, key, id);
  else jSetNull(o, key);
}

/** Findet ein Objekt mit "id" in einem Array */
inline cJSON *jFindId(const cJSON *arr, int id, int *index = nullptr) {
  int i = 0;
  cJSON *it;
  cJSON_ArrayForEach(it, arr) {
    if (jInt(it, "id") == id) {
      if (index) *index = i;
      return it;
    }
    i++;
  }
  return nullptr;
}

/** Schlüssel aus Export-Dateien kann Zahl oder Text sein */
inline String jKey(const cJSON *v) {
  if (cJSON_IsString(v)) return String(v->valuestring);
  if (cJSON_IsNumber(v)) return String((long)v->valuedouble);
  return String();
}
