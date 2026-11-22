// REST-API der ESP32-Variante. Spiegelt die Schnittstelle des Node-Servers, damit dasselbe
// Frontend verwendet werden kann – vereinfacht auf einen Benutzer und ohne Bilder.
#include "api.h"
#include <algorithm>
#include <functional>
#include <time.h>
#include <vector>
#include "config.h"
#include "dates.h"
#include "jsonutil.h"
#include "store.h"
#include "web_assets.h"

static WebServer *S = nullptr;
static const char *JSON_TYPE = "application/json; charset=utf-8";
static const int USER_ID = 1;

// ---------- Antworten ----------

static void sendText(int code, const String &body) { S->send(code, JSON_TYPE, body); }

static void sendJson(int code, const cJSON *j) {
  char *text = cJSON_PrintUnformatted(j);
  if (!text) {
    sendText(500, "{\"error\":\"Zu wenig Speicher.\"}");
    return;
  }
  S->send(code, JSON_TYPE, text);
  free(text);
}

static void sendJson(const JPtr &j) { sendJson(200, j.get()); }

static void sendError(int code, const String &msg) {
  JPtr e(cJSON_CreateObject());
  jSetStr(e.get(), "error", msg.c_str());
  sendJson(code, e.get());
}

static void sendOk() { sendText(200, "{\"ok\":true}"); }

static bool saveOrFail(const char *path, const cJSON *json) {
  if (saveJson(path, json)) return true;
  sendError(507, "Speichern fehlgeschlagen. Ist der Speicher voll?");
  return false;
}

// ---------- Anfragen ----------

static JPtr body() { return JPtr(cJSON_Parse(S->arg("plain").c_str())); }

static int toId(const String &s) {
  for (size_t i = 0; i < s.length(); i++)
    if (!isDigit(s[i])) return -1;
  return s.length() ? s.toInt() : -1;
}

/** Name prüfen: vorhanden, nicht leer, höchstens 120 Zeichen */
static bool readName(const cJSON *o, String &out, const char *key = "name") {
  const char *v = jStr(o, key);
  String s = v ? String(v) : String();
  s.trim();
  if (!s.length()) {
    sendError(400, "Bitte einen Namen angeben.");
    return false;
  }
  if (s.length() > 120 * 4) {  // UTF-8: großzügig
    sendError(400, "Der Name ist zu lang.");
    return false;
  }
  out = s;
  return true;
}

static bool readInt(const cJSON *o, const char *key, int min, int max, int &out, const char *msg) {
  cJSON *v = jget(o, key);
  if (!jIsInt(v) || v->valuedouble < min || v->valuedouble > max) {
    sendError(400, msg);
    return false;
  }
  out = (int)v->valuedouble;
  return true;
}

static bool isOneOf(const char *v, std::initializer_list<const char *> options) {
  if (!v) return false;
  for (auto o : options)
    if (strcmp(v, o) == 0) return true;
  return false;
}

static String isoNow() {
  time_t now = time(nullptr);
  if (now < 1700000000) return String();
  struct tm t;
  gmtime_r(&now, &t);
  char buf[32];
  strftime(buf, sizeof buf, "%Y-%m-%dT%H:%M:%S.000Z", &t);
  return buf;
}

// ---------- Anmeldung ----------

static const bool PASSWORD_REQUIRED = strlen(APP_PASSWORD) > 0;
static String tokens[8];
static int tokenPos = 0;

static bool authorized() {
  if (!PASSWORD_REQUIRED) return true;
  String cookie = S->header("Cookie");
  int p = cookie.indexOf("ffh_session=");
  if (p < 0) return false;
  String token = cookie.substring(p + 12, p + 12 + 64);
  if (token.length() != 64) return false;
  for (auto &t : tokens)
    if (t.length() && t == token) return true;
  return false;
}

static JPtr profile() {
  JPtr p(cJSON_CreateObject());
  jSetInt(p.get(), "id", USER_ID);
  jSetStr(p.get(), "name", jStr(meta(), "name", USER_NAME));
  jSetNull(p.get(), "avatar");
  jSetStr(p.get(), "theme", jStr(meta(), "theme", "standard"));
  jSetStr(p.get(), "colorMode", jStr(meta(), "colorMode", "system"));
  jSetBool(p.get(), "passwordRequired", PASSWORD_REQUIRED);
  return p;
}

static void hLogin() {
  JPtr b = body();
  const char *pw = jStr(b.get(), "password", "");
  // Vergleich in konstanter Zeit
  const char *expected = APP_PASSWORD;
  size_t n = max(strlen(pw), strlen(expected));
  uint8_t diff = strlen(pw) != strlen(expected);
  for (size_t i = 0; i < n; i++) diff |= (uint8_t)(i < strlen(pw) ? pw[i] : 0) ^ (uint8_t)(i < strlen(expected) ? expected[i] : 0);
  if (PASSWORD_REQUIRED && diff) {
    delay(500);  // bremst Rateversuche
    sendError(401, "Das Passwort ist falsch.");
    return;
  }
  char token[65];
  for (int i = 0; i < 32; i++) sprintf(token + i * 2, "%02x", (unsigned)(esp_random() & 0xff));
  tokens[tokenPos] = token;
  tokenPos = (tokenPos + 1) % 8;
  S->sendHeader("Set-Cookie", String("ffh_session=") + token + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000");
  sendJson(profile());
}

static void hLogout() {
  String cookie = S->header("Cookie");
  int p = cookie.indexOf("ffh_session=");
  if (p >= 0) {
    String token = cookie.substring(p + 12, p + 12 + 64);
    for (auto &t : tokens)
      if (t == token) t = "";
  }
  S->sendHeader("Set-Cookie", "ffh_session=; Path=/; Max-Age=0");
  sendOk();
}

static void hUpdateProfile() {
  JPtr b = body();
  if (!b) return sendError(400, "Ungültige Anfrage.");
  if (jget(b.get(), "name")) {
    String name;
    if (!readName(b.get(), name)) return;
    jSetStr(meta(), "name", name.c_str());
  }
  const char *theme = jStr(b.get(), "theme");
  if (theme) {
    if (!isOneOf(theme, {"standard", "ozean", "sonnenuntergang", "lavendel", "kirsche"})) return sendError(400, "Unbekanntes Farbschema.");
    jSetStr(meta(), "theme", theme);
  }
  const char *mode = jStr(b.get(), "colorMode");
  if (mode) {
    if (!isOneOf(mode, {"system", "light", "dark"})) return sendError(400, "Unbekannter Modus.");
    jSetStr(meta(), "colorMode", mode);
  }
  if (!saveMeta()) return sendError(507, "Speichern fehlgeschlagen.");
  sendJson(profile());
}

// ---------- Übungen ----------

static cJSON *exerciseOut(const cJSON *e) {
  cJSON *o = cJSON_Duplicate(e, true);
  jSetNull(o, "image");
  return o;
}

static void hExercises(const std::vector<String> &seg, HTTPMethod m) {
  JPtr list = loadArray(F_EXERCISES);
  if (seg.size() == 1 && m == HTTP_GET) {
    JPtr out(cJSON_CreateArray());
    cJSON *e;
    cJSON_ArrayForEach(e, list.get()) cJSON_AddItemToArray(out.get(), exerciseOut(e));
    return sendJson(out);
  }
  int id = seg.size() == 2 ? toId(seg[1]) : 0;
  if ((seg.size() == 1 && m == HTTP_POST) || (seg.size() == 2 && m == HTTP_PUT)) {
    JPtr b = body();
    String name;
    if (!readName(b.get(), name)) return;
    const char *desc = jStr(b.get(), "description", "");
    if (strlen(desc) > 5000) return sendError(400, "Die Beschreibung ist zu lang.");
    cJSON *e;
    if (m == HTTP_POST) {
      e = cJSON_CreateObject();
      jSetInt(e, "id", nextId());
      cJSON_AddItemToArray(list.get(), e);
    } else if (!(e = jFindId(list.get(), id))) {
      return sendError(404, "Übung nicht gefunden.");
    }
    jSetStr(e, "name", name.c_str());
    jSetStr(e, "description", desc);
    if (!saveOrFail(F_EXERCISES, list.get())) return;
    JPtr out(exerciseOut(e));
    return sendJson(out);
  }
  if (seg.size() == 2 && m == HTTP_DELETE) {
    int index;
    if (!jFindId(list.get(), id, &index)) return sendError(404, "Übung nicht gefunden.");
    JPtr workouts = loadArray(F_WORKOUTS);
    String used;
    cJSON *w;
    cJSON_ArrayForEach(w, workouts.get()) {
      cJSON *it;
      cJSON_ArrayForEach(it, jget(w, "items")) {
        if (jInt(it, "exerciseId") == id) {
          used += (used.length() ? ", " : "") + String(jStr(w, "name", ""));
          break;
        }
      }
    }
    if (used.length()) return sendError(409, "Die Übung wird noch in folgenden Workouts verwendet: " + used);
    cJSON_DeleteItemFromArray(list.get(), index);
    if (!saveOrFail(F_EXERCISES, list.get())) return;
    return sendOk();
  }
  sendError(404, "Nicht gefunden.");
}

static void hStretchExercises(const std::vector<String> &seg, HTTPMethod m) {
  JPtr list = loadArray(F_STRETCH_EXERCISES);
  if (seg.size() == 1 && m == HTTP_GET) {
    JPtr out(cJSON_CreateArray());
    cJSON *e;
    cJSON_ArrayForEach(e, list.get()) cJSON_AddItemToArray(out.get(), exerciseOut(e));
    return sendJson(out);
  }
  int id = seg.size() == 2 ? toId(seg[1]) : 0;
  if ((seg.size() == 1 && m == HTTP_POST) || (seg.size() == 2 && m == HTTP_PUT)) {
    JPtr b = body();
    String name;
    int duration;
    if (!readName(b.get(), name)) return;
    if (!readInt(b.get(), "durationSec", 1, 86400, duration, "Die Ausführungszeit muss mindestens 1 Sekunde sein.")) return;
    cJSON *e;
    if (m == HTTP_POST) {
      e = cJSON_CreateObject();
      jSetInt(e, "id", nextId());
      cJSON_AddItemToArray(list.get(), e);
    } else if (!(e = jFindId(list.get(), id))) {
      return sendError(404, "Stretching-Übung nicht gefunden.");
    }
    jSetStr(e, "name", name.c_str());
    jSetInt(e, "durationSec", duration);
    if (!saveOrFail(F_STRETCH_EXERCISES, list.get())) return;
    JPtr out(exerciseOut(e));
    return sendJson(out);
  }
  if (seg.size() == 2 && m == HTTP_DELETE) {
    int index;
    if (!jFindId(list.get(), id, &index)) return sendError(404, "Stretching-Übung nicht gefunden.");
    JPtr stretchings = loadArray(F_STRETCHINGS);
    String used;
    cJSON *s;
    cJSON_ArrayForEach(s, stretchings.get()) {
      cJSON *it;
      cJSON_ArrayForEach(it, jget(s, "items")) {
        if (jIsInt(it) && (int)it->valuedouble == id) {
          used += (used.length() ? ", " : "") + String(jStr(s, "name", ""));
          break;
        }
      }
    }
    if (used.length()) return sendError(409, "Die Stretching-Übung wird noch in folgenden Stretchings verwendet: " + used);
    cJSON_DeleteItemFromArray(list.get(), index);
    if (!saveOrFail(F_STRETCH_EXERCISES, list.get())) return;
    return sendOk();
  }
  sendError(404, "Nicht gefunden.");
}

// ---------- Workouts & Stretchings ----------

static void addOwner(cJSON *o) {
  jSetBool(o, "shared", false);
  jSetInt(o, "ownerId", USER_ID);
  jSetStr(o, "ownerName", jStr(meta(), "name", USER_NAME));
}

static cJSON *workoutOut(const cJSON *w, const cJSON *exercises) {
  cJSON *o = cJSON_CreateObject();
  jSetInt(o, "id", jInt(w, "id"));
  jSetStr(o, "name", jStr(w, "name", ""));
  jSetInt(o, "rounds", jInt(w, "rounds", 1));
  jSetInt(o, "restBetweenExercises", jInt(w, "restBetweenExercises"));
  jSetInt(o, "restBetweenRounds", jInt(w, "restBetweenRounds"));
  addOwner(o);
  cJSON *items = cJSON_AddArrayToObject(o, "items");
  cJSON *it;
  cJSON_ArrayForEach(it, jget(w, "items")) {
    cJSON *ex = jFindId(exercises, jInt(it, "exerciseId"));
    if (!ex) continue;
    cJSON *i = cJSON_CreateObject();
    jSetInt(i, "exerciseId", jInt(it, "exerciseId"));
    jSetStr(i, "type", jStr(it, "type", "time"));
    jSetInt(i, "value", jInt(it, "value", 1));
    jSetInt(i, "sets", jInt(it, "sets", 1));
    jSetStr(i, "exerciseName", jStr(ex, "name", ""));
    jSetStr(i, "exerciseDescription", jStr(ex, "description", ""));
    jSetNull(i, "exerciseImage");
    cJSON_AddItemToArray(items, i);
  }
  return o;
}

static cJSON *stretchingOut(const cJSON *s, const cJSON *exercises) {
  cJSON *o = cJSON_CreateObject();
  jSetInt(o, "id", jInt(s, "id"));
  jSetStr(o, "name", jStr(s, "name", ""));
  addOwner(o);
  cJSON *items = cJSON_AddArrayToObject(o, "items");
  cJSON *it;
  cJSON_ArrayForEach(it, jget(s, "items")) {
    cJSON *ex = jFindId(exercises, (int)it->valuedouble);
    if (!ex) continue;
    cJSON *i = cJSON_CreateObject();
    jSetInt(i, "stretchExerciseId", jInt(ex, "id"));
    jSetStr(i, "name", jStr(ex, "name", ""));
    jSetInt(i, "durationSec", jInt(ex, "durationSec", 30));
    jSetNull(i, "image");
    cJSON_AddItemToArray(items, i);
  }
  return o;
}

/** Workout-Eingabe prüfen und als gespeichertes Objekt aufbauen (ohne id). */
static JPtr parseWorkout(const cJSON *b, const cJSON *exercises) {
  String name;
  int rounds, restEx, restRound;
  if (!readName(b, name)) return JPtr();
  if (!readInt(b, "rounds", 1, 100, rounds, "Mindestens eine Runde.")) return JPtr();
  if (!readInt(b, "restBetweenExercises", 0, 86400, restEx, "Die Pause zwischen Übungen muss eine Zahl sein.")) return JPtr();
  if (!readInt(b, "restBetweenRounds", 0, 86400, restRound, "Die Pause zwischen Runden muss eine Zahl sein.")) return JPtr();
  cJSON *items = jget(b, "items");
  if (!cJSON_IsArray(items) || cJSON_GetArraySize(items) > 200) {
    sendError(400, "Ungültige Übungsliste.");
    return JPtr();
  }
  JPtr w(cJSON_CreateObject());
  jSetStr(w.get(), "name", name.c_str());
  jSetInt(w.get(), "rounds", rounds);
  jSetInt(w.get(), "restBetweenExercises", restEx);
  jSetInt(w.get(), "restBetweenRounds", restRound);
  cJSON *out = cJSON_AddArrayToObject(w.get(), "items");
  cJSON *it;
  cJSON_ArrayForEach(it, items) {
    int exId, value, sets;
    const char *type = jStr(it, "type");
    if (!readInt(it, "exerciseId", 1, INT32_MAX, exId, "Eine ausgewählte Übung existiert nicht.")) return JPtr();
    if (!jFindId(exercises, exId)) {
      sendError(400, "Eine ausgewählte Übung existiert nicht.");
      return JPtr();
    }
    if (!isOneOf(type, {"time", "reps"})) {
      sendError(400, "Ungültiger Typ.");
      return JPtr();
    }
    if (!readInt(it, "value", 1, 86400, value, "Der Wert muss mindestens 1 sein.")) return JPtr();
    if (!readInt(it, "sets", 1, 100, sets, "Mindestens ein Satz.")) return JPtr();
    cJSON *i = cJSON_CreateObject();
    jSetInt(i, "exerciseId", exId);
    jSetStr(i, "type", type);
    jSetInt(i, "value", value);
    jSetInt(i, "sets", sets);
    cJSON_AddItemToArray(out, i);
  }
  return w;
}

static JPtr parseStretching(const cJSON *b, const cJSON *exercises) {
  String name;
  if (!readName(b, name)) return JPtr();
  cJSON *items = jget(b, "items");
  if (!cJSON_IsArray(items) || cJSON_GetArraySize(items) > 200) {
    sendError(400, "Ungültige Übungsliste.");
    return JPtr();
  }
  JPtr s(cJSON_CreateObject());
  jSetStr(s.get(), "name", name.c_str());
  cJSON *out = cJSON_AddArrayToObject(s.get(), "items");
  cJSON *it;
  cJSON_ArrayForEach(it, items) {
    int exId = jInt(it, "stretchExerciseId", -1);
    if (!jFindId(exercises, exId)) {
      sendError(400, "Eine ausgewählte Stretching-Übung existiert nicht.");
      return JPtr();
    }
    cJSON_AddItemToArray(out, cJSON_CreateNumber(exId));
  }
  return s;
}

/** Entfernt Verweise eines gelöschten Workouts/Stretchings aus den Plänen („nach Wahl“). */
static void clearPlanRefs(const char *key, int id) {
  JPtr plans = loadArray(F_PLANS);
  bool changed = false;
  cJSON *p;
  cJSON_ArrayForEach(p, plans.get()) {
    cJSON *e;
    cJSON_ArrayForEach(e, jget(p, "entries")) {
      if (jInt(e, key) == id) {
        jSetNull(e, key);
        changed = true;
      }
    }
  }
  if (changed) saveJson(F_PLANS, plans.get());
}

static void hWorkouts(const std::vector<String> &seg, HTTPMethod m) {
  JPtr list = loadArray(F_WORKOUTS);
  JPtr exercises = loadArray(F_EXERCISES);
  int id = seg.size() == 2 ? toId(seg[1]) : 0;
  if (seg.size() == 1 && m == HTTP_GET) {
    JPtr out(cJSON_CreateArray());
    cJSON *w;
    cJSON_ArrayForEach(w, list.get()) cJSON_AddItemToArray(out.get(), workoutOut(w, exercises.get()));
    return sendJson(out);
  }
  if (seg.size() == 2 && m == HTTP_GET) {
    cJSON *w = jFindId(list.get(), id);
    if (!w) return sendError(404, "Workout nicht gefunden.");
    JPtr out(workoutOut(w, exercises.get()));
    return sendJson(out);
  }
  if ((seg.size() == 1 && m == HTTP_POST) || (seg.size() == 2 && m == HTTP_PUT)) {
    int index = -1;
    if (m == HTTP_PUT && !jFindId(list.get(), id, &index)) return sendError(404, "Workout nicht gefunden.");
    JPtr b = body();
    JPtr w = parseWorkout(b.get(), exercises.get());
    if (!w) return;
    if (m == HTTP_POST) id = nextId();
    cJSON_AddNumberToObject(w.get(), "id", id);
    cJSON *stored = w.release();
    if (index >= 0) cJSON_ReplaceItemInArray(list.get(), index, stored);
    else cJSON_AddItemToArray(list.get(), stored);
    if (!saveOrFail(F_WORKOUTS, list.get())) return;
    JPtr out(workoutOut(stored, exercises.get()));
    return sendJson(out);
  }
  if (seg.size() == 2 && m == HTTP_DELETE) {
    int index;
    if (!jFindId(list.get(), id, &index)) return sendError(404, "Workout nicht gefunden.");
    cJSON_DeleteItemFromArray(list.get(), index);
    if (!saveOrFail(F_WORKOUTS, list.get())) return;
    clearPlanRefs("workoutId", id);
    return sendOk();
  }
  sendError(404, "Nicht gefunden.");
}

static void hStretchings(const std::vector<String> &seg, HTTPMethod m) {
  JPtr list = loadArray(F_STRETCHINGS);
  JPtr exercises = loadArray(F_STRETCH_EXERCISES);
  int id = seg.size() == 2 ? toId(seg[1]) : 0;
  if (seg.size() == 1 && m == HTTP_GET) {
    JPtr out(cJSON_CreateArray());
    cJSON *s;
    cJSON_ArrayForEach(s, list.get()) cJSON_AddItemToArray(out.get(), stretchingOut(s, exercises.get()));
    return sendJson(out);
  }
  if (seg.size() == 2 && m == HTTP_GET) {
    cJSON *s = jFindId(list.get(), id);
    if (!s) return sendError(404, "Stretching nicht gefunden.");
    JPtr out(stretchingOut(s, exercises.get()));
    return sendJson(out);
  }
  if ((seg.size() == 1 && m == HTTP_POST) || (seg.size() == 2 && m == HTTP_PUT)) {
    int index = -1;
    if (m == HTTP_PUT && !jFindId(list.get(), id, &index)) return sendError(404, "Stretching nicht gefunden.");
    JPtr b = body();
    JPtr s = parseStretching(b.get(), exercises.get());
    if (!s) return;
    if (m == HTTP_POST) id = nextId();
    cJSON_AddNumberToObject(s.get(), "id", id);
    cJSON *stored = s.release();
    if (index >= 0) cJSON_ReplaceItemInArray(list.get(), index, stored);
    else cJSON_AddItemToArray(list.get(), stored);
    if (!saveOrFail(F_STRETCHINGS, list.get())) return;
    JPtr out(stretchingOut(stored, exercises.get()));
    return sendJson(out);
  }
  if (seg.size() == 2 && m == HTTP_DELETE) {
    int index;
    if (!jFindId(list.get(), id, &index)) return sendError(404, "Stretching nicht gefunden.");
    cJSON_DeleteItemFromArray(list.get(), index);
    if (!saveOrFail(F_STRETCHINGS, list.get())) return;
    clearPlanRefs("stretchingId", id);
    return sendOk();
  }
  sendError(404, "Nicht gefunden.");
}

// ---------- Verlauf ----------

/** Prüft eine Ausführung und baut die zu speichernde Zeile (id zuerst!). */
static JPtr parseExecution(const cJSON *b, bool respond = true) {
  auto fail = [&](const char *msg) {
    if (respond) sendError(400, msg);
    return JPtr();
  };
  const char *kind = jStr(b, "kind");
  const char *name = jStr(b, "name");
  const char *startedAt = jStr(b, "startedAt");
  const char *status = jStr(b, "status");
  const char *rating = jStr(b, "rating");
  cJSON *dur = jget(b, "durationSec");
  if (!isOneOf(kind, {"workout", "stretching", "activity"})) return fail("Ungültiger Typ.");
  if (!name || !strlen(name) || strlen(name) > 480) return fail("Bitte einen Namen angeben.");
  if (!startedAt || isoKey(startedAt) == 0 || strlen(startedAt) > 40) return fail("Ungültiges Datum.");
  if (!jIsInt(dur) || dur->valuedouble < 0) return fail("Ungültige Dauer.");
  if (!isOneOf(status, {"completed", "aborted"})) return fail("Ungültiger Status.");
  if (rating && !isOneOf(rating, {"bad", "medium", "good"})) return fail("Ungültige Bewertung.");
  cJSON *dist = jget(b, "distanceKm");
  if (dist && !cJSON_IsNull(dist) && (!cJSON_IsNumber(dist) || dist->valuedouble < 0)) return fail("Ungültige Strecke.");

  JPtr e(cJSON_CreateObject());
  jSetInt(e.get(), "id", 0);  // wird beim Speichern gesetzt
  jSetStr(e.get(), "kind", kind);
  jSetStr(e.get(), "name", name);
  jSetStr(e.get(), "startedAt", startedAt);
  jSetInt(e.get(), "durationSec", (int)dur->valuedouble);
  if (dist && cJSON_IsNumber(dist)) jSet(e.get(), "distanceKm", cJSON_CreateNumber(dist->valuedouble));
  else jSetNull(e.get(), "distanceKm");
  if (rating && strcmp(status, "completed") == 0) jSetStr(e.get(), "rating", rating);
  else jSetNull(e.get(), "rating");
  jSetStr(e.get(), "status", status);
  return e;
}

/** Verlaufseinträge als JSON-Array streamen – neueste zuerst. */
static void streamExecutions(const char *prefix, const char *suffix) {
  std::vector<ExecIndex> idx = executionIndex();
  S->setContentLength(CONTENT_LENGTH_UNKNOWN);
  S->send(200, JSON_TYPE, prefix);
  String buf;
  bool first = true;
  for (const auto &x : idx) {
    String line = readExecutionLine(x.offset);
    if (line.length() < 2) continue;
    if (!first) buf += ',';
    first = false;
    buf += line;
    if (buf.length() > 1024) {
      S->sendContent(buf);
      buf = "";
    }
  }
  buf += suffix;
  S->sendContent(buf);
  S->sendContent("");
}

// ---------- Trainingspläne ----------

static cJSON *activityById(const cJSON *acts, int id) { return jFindId(acts, id); }

/** Plan mit Namen der verknüpften Workouts/Stretchings/Aktivitäten */
static cJSON *planOut(const cJSON *p) {
  JPtr workouts = loadArray(F_WORKOUTS);
  JPtr stretchings = loadArray(F_STRETCHINGS);
  JPtr acts = loadArray(F_ACTIVITIES);
  cJSON *o = cJSON_Duplicate(p, true);
  cJSON *e;
  cJSON_ArrayForEach(e, jget(o, "entries")) {
    cJSON *w = jIsNull(e, "workoutId") ? nullptr : jFindId(workouts.get(), jInt(e, "workoutId"));
    cJSON *s = jIsNull(e, "stretchingId") ? nullptr : jFindId(stretchings.get(), jInt(e, "stretchingId"));
    cJSON *a = jIsNull(e, "activityTypeId") ? nullptr : activityById(acts.get(), jInt(e, "activityTypeId"));
    if (w) jSetStr(e, "workoutName", jStr(w, "name", ""));
    else jSetNull(e, "workoutName");
    if (s) jSetStr(e, "stretchingName", jStr(s, "name", ""));
    else jSetNull(e, "stretchingName");
    if (a) {
      jSetStr(e, "activityName", jStr(a, "name", ""));
      jSetStr(e, "activityIcon", jStr(a, "icon", "🏃"));
    } else {
      jSetNull(e, "activityName");
      jSetNull(e, "activityIcon");
    }
  }
  return o;
}

/**
 * Prüft, ob ein Eintrag am Datum im Plan steht. Liefert den Eintrag oder nullptr
 * (dann wurde bereits eine Fehlermeldung gesendet).
 */
static cJSON *entryForDate(cJSON *plan, int entryId, const char *date) {
  cJSON *entry = jFindId(jget(plan, "entries"), entryId);
  if (!entry) {
    sendError(404, "Eintrag nicht gefunden.");
    return nullptr;
  }
  long start, day;
  if (!parseDate(jStr(plan, "startDate"), start) || !parseDate(date, day)) {
    sendError(400, "Ungültiges Datum.");
    return nullptr;
  }
  int week = weekOf(start, day);
  if (week < 1 || week > jInt(plan, "weeks")) {
    sendError(400, "Das Datum liegt außerhalb des Trainingsplans.");
    return nullptr;
  }
  int weekday = weekdayOf(day);
  bool overridden = false;
  cJSON *o;
  cJSON_ArrayForEach(o, jget(plan, "overrides")) {
    if (jInt(o, "week") == week && jInt(o, "weekday") == weekday) overridden = true;
  }
  if (jInt(entry, "weekday") != weekday || jInt(entry, "week") != (overridden ? week : 0)) {
    sendError(400, "Dieser Eintrag steht an diesem Tag nicht im Plan.");
    return nullptr;
  }
  return entry;
}

static void addCompletion(cJSON *plan, int entryId, const char *date, int executionId) {
  cJSON *list = jget(plan, "completions");
  if (!list) list = cJSON_AddArrayToObject(plan, "completions");
  cJSON *c;
  cJSON_ArrayForEach(c, list) {
    if (jInt(c, "entryId") == entryId && strcmp(jStr(c, "date", ""), date) == 0) {
      jSetIdOrNull(c, "executionId", executionId);
      return;
    }
  }
  c = cJSON_CreateObject();
  jSetInt(c, "entryId", entryId);
  jSetStr(c, "date", date);
  jSetIdOrNull(c, "executionId", executionId);
  cJSON_AddItemToArray(list, c);
}

static void hExecutions(const std::vector<String> &seg, HTTPMethod m) {
  if (seg.size() == 1 && m == HTTP_GET) return streamExecutions("[", "]");
  if (seg.size() == 1 && m == HTTP_POST) {
    JPtr b = body();
    JPtr e = parseExecution(b.get());
    if (!e) return;
    // Optional mit einem Planeintrag verknüpft → nach dem Speichern abhaken
    cJSON *link = jget(b.get(), "plan");
    JPtr plans;
    cJSON *plan = nullptr;
    cJSON *entry = nullptr;
    if (cJSON_IsObject(link)) {
      plans = loadArray(F_PLANS);
      plan = jFindId(plans.get(), jInt(link, "planId"));
      if (!plan) return sendError(404, "Trainingsplan nicht gefunden.");
      entry = entryForDate(plan, jInt(link, "entryId"), jStr(link, "date", ""));
      if (!entry) return;
    }
    int id = nextId();
    jSetInt(e.get(), "id", id);
    if (!appendExecution(e.get())) return sendError(507, "Speichern fehlgeschlagen. Ist der Speicher voll?");
    if (plan && strcmp(jStr(e.get(), "status", ""), "completed") == 0 &&
        strcmp(jStr(entry, "kind", ""), jStr(e.get(), "kind", "")) == 0) {
      addCompletion(plan, jInt(link, "entryId"), jStr(link, "date", ""), id);
      saveJson(F_PLANS, plans.get());
    }
    return sendText(200, String("{\"id\":") + id + "}");
  }
  if (seg.size() == 2 && m == HTTP_DELETE) {
    if (!deleteExecution(toId(seg[1]))) return sendError(404, "Eintrag nicht gefunden.");
    return sendOk();
  }
  sendError(404, "Nicht gefunden.");
}

static void hActivities(const std::vector<String> &seg, HTTPMethod m) {
  JPtr list = loadArray(F_ACTIVITIES);
  if (seg.size() == 1 && m == HTTP_GET) return sendJson(list);
  int id = seg.size() == 2 ? toId(seg[1]) : 0;
  if ((seg.size() == 1 && m == HTTP_POST) || (seg.size() == 2 && m == HTTP_PUT)) {
    JPtr b = body();
    String name;
    if (!readName(b.get(), name)) return;
    String icon = jStr(b.get(), "icon", "🏃");
    if (!icon.length() || icon.length() > 16) icon = "🏃";
    cJSON *it;
    cJSON_ArrayForEach(it, list.get()) {
      if (jInt(it, "id") != id && name.equalsIgnoreCase(jStr(it, "name", ""))) return sendError(409, "Diese Aktivität gibt es bereits.");
    }
    cJSON *a;
    if (m == HTTP_POST) {
      a = cJSON_CreateObject();
      jSetInt(a, "id", nextId());
      cJSON_AddItemToArray(list.get(), a);
    } else if (!(a = jFindId(list.get(), id))) {
      return sendError(404, "Aktivität nicht gefunden.");
    }
    jSetStr(a, "name", name.c_str());
    jSetStr(a, "icon", icon.c_str());
    if (!saveOrFail(F_ACTIVITIES, list.get())) return;
    return sendJson(200, a);
  }
  if (seg.size() == 2 && m == HTTP_DELETE) {
    int index;
    if (!jFindId(list.get(), id, &index)) return sendError(404, "Aktivität nicht gefunden.");
    JPtr plans = loadArray(F_PLANS);
    String used;
    cJSON *p;
    cJSON_ArrayForEach(p, plans.get()) {
      cJSON *e;
      cJSON_ArrayForEach(e, jget(p, "entries")) {
        if (jInt(e, "activityTypeId") == id) {
          used += (used.length() ? ", " : "") + String(jStr(p, "name", ""));
          break;
        }
      }
    }
    if (used.length()) return sendError(409, "Die Aktivität wird noch in folgenden Trainingsplänen verwendet: " + used);
    cJSON_DeleteItemFromArray(list.get(), index);
    if (!saveOrFail(F_ACTIVITIES, list.get())) return;
    return sendOk();
  }
  sendError(404, "Nicht gefunden.");
}

/** Plan-Eingabe prüfen; existing = bisheriger Plan (für stabile Eintrags-IDs und Haken) */
static JPtr parsePlan(const cJSON *b, const cJSON *existing) {
  String name;
  int weeks;
  if (!readName(b, name)) return JPtr();
  if (!readInt(b, "weeks", 1, 104, weeks, "Die Anzahl Wochen muss zwischen 1 und 104 liegen.")) return JPtr();
  const char *startDate = jStr(b, "startDate");
  long startDays;
  if (!parseDate(startDate, startDays)) {
    sendError(400, "Ungültiges Datum.");
    return JPtr();
  }
  cJSON *entries = jget(b, "entries");
  if (!cJSON_IsArray(entries) || cJSON_GetArraySize(entries) > 2000) {
    sendError(400, "Ungültige Einträge.");
    return JPtr();
  }
  JPtr workouts = loadArray(F_WORKOUTS);
  JPtr stretchings = loadArray(F_STRETCHINGS);
  JPtr acts = loadArray(F_ACTIVITIES);

  JPtr p(cJSON_CreateObject());
  jSetStr(p.get(), "name", name.c_str());
  jSetInt(p.get(), "weeks", weeks);
  jSetStr(p.get(), "startDate", startDate);
  jSetBool(p.get(), "active", jBool(b, "active"));

  // Abweichungen: nur innerhalb der Laufzeit, ohne Doppelte
  cJSON *overrides = cJSON_AddArrayToObject(p.get(), "overrides");
  std::vector<int> slots;
  cJSON *o;
  cJSON_ArrayForEach(o, jget(b, "overrides")) {
    int w = jInt(o, "week"), d = jInt(o, "weekday");
    if (w < 1 || w > weeks || d < 1 || d > 7) continue;
    int key = w * 10 + d;
    if (std::find(slots.begin(), slots.end(), key) != slots.end()) continue;
    slots.push_back(key);
    cJSON *x = cJSON_CreateObject();
    jSetInt(x, "week", w);
    jSetInt(x, "weekday", d);
    cJSON_AddItemToArray(overrides, x);
  }

  std::vector<int> oldIds, usedIds;
  cJSON *e;
  cJSON_ArrayForEach(e, (existing ? jget(existing, "entries") : nullptr)) oldIds.push_back(jInt(e, "id"));

  cJSON *outEntries = cJSON_AddArrayToObject(p.get(), "entries");
  cJSON_ArrayForEach(e, entries) {
    int week = jInt(e, "week", -1), weekday = jInt(e, "weekday", -1);
    const char *kind = jStr(e, "kind");
    if (week < 0 || week > 104 || weekday < 1 || weekday > 7 || !isOneOf(kind, {"workout", "stretching", "activity"})) {
      sendError(400, "Ungültiger Eintrag im Plan.");
      return JPtr();
    }
    if (week > 0 && std::find(slots.begin(), slots.end(), week * 10 + weekday) == slots.end()) continue;
    cJSON *x = cJSON_CreateObject();
    int id = jInt(e, "id", 0);
    bool keep = id > 0 && std::find(oldIds.begin(), oldIds.end(), id) != oldIds.end() &&
                std::find(usedIds.begin(), usedIds.end(), id) == usedIds.end();
    id = keep ? id : nextId(false);
    usedIds.push_back(id);
    jSetInt(x, "id", id);
    jSetInt(x, "week", week);
    jSetInt(x, "weekday", weekday);
    jSetStr(x, "kind", kind);
    int wId = jIsNull(e, "workoutId") ? 0 : jInt(e, "workoutId");
    int sId = jIsNull(e, "stretchingId") ? 0 : jInt(e, "stretchingId");
    int aId = jIsNull(e, "activityTypeId") ? 0 : jInt(e, "activityTypeId");
    bool isW = !strcmp(kind, "workout"), isS = !strcmp(kind, "stretching"), isA = !strcmp(kind, "activity");
    if (isW && wId && !jFindId(workouts.get(), wId)) {
      cJSON_Delete(x);
      sendError(400, "Ein ausgewähltes Workout existiert nicht.");
      return JPtr();
    }
    if (isS && sId && !jFindId(stretchings.get(), sId)) {
      cJSON_Delete(x);
      sendError(400, "Ein ausgewähltes Stretching existiert nicht.");
      return JPtr();
    }
    if (isA && (!aId || !jFindId(acts.get(), aId))) {
      cJSON_Delete(x);
      sendError(400, "Bitte eine Aktivität auswählen.");
      return JPtr();
    }
    jSetIdOrNull(x, "workoutId", isW ? wId : 0);
    jSetIdOrNull(x, "stretchingId", isS ? sId : 0);
    jSetIdOrNull(x, "activityTypeId", isA ? aId : 0);
    const char *tt = jStr(e, "targetType");
    if (isA && isOneOf(tt, {"duration", "distance"}) && cJSON_IsNumber(jget(e, "targetValue"))) {
      jSetStr(x, "targetType", tt);
      jSet(x, "targetValue", cJSON_CreateNumber(jNum(e, "targetValue")));
    } else {
      jSetNull(x, "targetType");
      jSetNull(x, "targetValue");
    }
    cJSON_AddItemToArray(outEntries, x);
  }
  saveMeta();  // neue IDs sichern

  // Haken nur für Einträge, die es noch gibt
  cJSON *completions = cJSON_AddArrayToObject(p.get(), "completions");
  cJSON *c;
  cJSON_ArrayForEach(c, (existing ? jget(existing, "completions") : nullptr)) {
    if (std::find(usedIds.begin(), usedIds.end(), jInt(c, "entryId")) != usedIds.end())
      cJSON_AddItemToArray(completions, cJSON_Duplicate(c, true));
  }
  return p;
}

static void hPlans(const std::vector<String> &seg, HTTPMethod m) {
  JPtr plans = loadArray(F_PLANS);
  if (seg.size() == 1 && m == HTTP_GET) {
    // Übersicht: aktiver Plan zuerst, dann nach Start absteigend
    std::vector<cJSON *> list;
    cJSON *p;
    cJSON_ArrayForEach(p, plans.get()) list.push_back(p);
    std::sort(list.begin(), list.end(), [](cJSON *a, cJSON *b) {
      if (jBool(a, "active") != jBool(b, "active")) return jBool(a, "active");
      return strcmp(jStr(a, "startDate", ""), jStr(b, "startDate", "")) > 0;
    });
    JPtr out(cJSON_CreateArray());
    for (cJSON *x : list) {
      cJSON *s = cJSON_CreateObject();
      jSetInt(s, "id", jInt(x, "id"));
      jSetStr(s, "name", jStr(x, "name", ""));
      jSetInt(s, "weeks", jInt(x, "weeks"));
      jSetStr(s, "startDate", jStr(x, "startDate", ""));
      jSetBool(s, "active", jBool(x, "active"));
      cJSON_AddItemToArray(out.get(), s);
    }
    return sendJson(out);
  }
  int id = seg.size() >= 2 ? toId(seg[1]) : 0;
  int index = -1;
  cJSON *plan = seg.size() >= 2 ? jFindId(plans.get(), id, &index) : nullptr;

  if (seg.size() == 2 && m == HTTP_GET) {
    if (!plan) return sendError(404, "Trainingsplan nicht gefunden.");
    JPtr out(planOut(plan));
    return sendJson(out);
  }
  if ((seg.size() == 1 && m == HTTP_POST) || (seg.size() == 2 && m == HTTP_PUT)) {
    if (m == HTTP_PUT && !plan) return sendError(404, "Trainingsplan nicht gefunden.");
    JPtr b = body();
    JPtr p = parsePlan(b.get(), plan);
    if (!p) return;
    if (m == HTTP_POST) id = nextId();
    cJSON_AddNumberToObject(p.get(), "id", id);
    if (jBool(p.get(), "active")) {
      cJSON *x;
      cJSON_ArrayForEach(x, plans.get()) jSetBool(x, "active", false);
    }
    cJSON *stored = p.release();
    if (index >= 0) cJSON_ReplaceItemInArray(plans.get(), index, stored);
    else cJSON_AddItemToArray(plans.get(), stored);
    if (!saveOrFail(F_PLANS, plans.get())) return;
    JPtr out(planOut(stored));
    return sendJson(out);
  }
  if (seg.size() == 2 && m == HTTP_DELETE) {
    if (!plan) return sendError(404, "Trainingsplan nicht gefunden.");
    cJSON_DeleteItemFromArray(plans.get(), index);
    if (!saveOrFail(F_PLANS, plans.get())) return;
    return sendOk();
  }
  // Aktivität bestätigen
  if (seg.size() == 3 && seg[2] == "completions" && m == HTTP_POST) {
    if (!plan) return sendError(404, "Trainingsplan nicht gefunden.");
    JPtr b = body();
    int entryId = jInt(b.get(), "entryId");
    const char *date = jStr(b.get(), "date", "");
    cJSON *entry = entryForDate(plan, entryId, date);
    if (!entry) return;
    if (strcmp(jStr(entry, "kind", ""), "activity") != 0) return sendError(400, "Workouts und Stretchings werden über „Starten“ erledigt.");
    JPtr acts = loadArray(F_ACTIVITIES);
    cJSON *act = activityById(acts.get(), jInt(entry, "activityTypeId"));
    const char *rating = jStr(b.get(), "rating");
    const char *startedAt = jStr(b.get(), "startedAt");
    String start = startedAt && isoKey(startedAt) ? String(startedAt) : String(date) + "T12:00:00.000Z";

    JPtr e(cJSON_CreateObject());
    int execId = nextId();
    jSetInt(e.get(), "id", execId);
    jSetStr(e.get(), "kind", "activity");
    jSetStr(e.get(), "name", act ? jStr(act, "name", "Aktivität") : "Aktivität");
    jSetStr(e.get(), "startedAt", start.c_str());
    jSetInt(e.get(), "durationSec", (int)round(jNum(b.get(), "durationMin", 0) * 60));
    if (cJSON_IsNumber(jget(b.get(), "distanceKm"))) jSet(e.get(), "distanceKm", cJSON_CreateNumber(jNum(b.get(), "distanceKm")));
    else jSetNull(e.get(), "distanceKm");
    if (isOneOf(rating, {"bad", "medium", "good"})) jSetStr(e.get(), "rating", rating);
    else jSetNull(e.get(), "rating");
    jSetStr(e.get(), "status", "completed");
    if (!appendExecution(e.get())) return sendError(507, "Speichern fehlgeschlagen. Ist der Speicher voll?");
    addCompletion(plan, entryId, date, execId);
    if (!saveOrFail(F_PLANS, plans.get())) return;
    JPtr out(planOut(plan));
    return sendJson(out);
  }
  // Haken entfernen: /plans/:id/completions/:entryId/:date
  if (seg.size() == 5 && seg[2] == "completions" && m == HTTP_DELETE) {
    if (!plan) return sendError(404, "Trainingsplan nicht gefunden.");
    int entryId = toId(seg[3]);
    cJSON *list = jget(plan, "completions");
    int i = 0;
    cJSON *c;
    cJSON_ArrayForEach(c, list) {
      if (jInt(c, "entryId") == entryId && seg[4] == jStr(c, "date", "")) {
        cJSON_DeleteItemFromArray(list, i);
        break;
      }
      i++;
    }
    if (!saveOrFail(F_PLANS, plans.get())) return;
    JPtr out(planOut(plan));
    return sendJson(out);
  }
  sendError(404, "Nicht gefunden.");
}

// ---------- Export / Import ----------

static void attachment(const char *base) {
  String date = isoNow().substring(0, 10);
  String name = date.length() ? String(base) + "-" + date + ".json" : String(base) + ".json";
  S->sendHeader("Content-Disposition", "attachment; filename=\"" + name + "\"");
}

static void hExportPlans() {
  JPtr exercises = loadArray(F_EXERCISES);
  JPtr stretchEx = loadArray(F_STRETCH_EXERCISES);
  JPtr workouts = loadArray(F_WORKOUTS);
  JPtr stretchings = loadArray(F_STRETCHINGS);
  JPtr out(cJSON_CreateObject());
  jSetStr(out.get(), "format", "fitnessforhealth-plans");
  jSetInt(out.get(), "version", 1);
  String now = isoNow();
  if (now.length()) jSetStr(out.get(), "exportedAt", now.c_str());
  cJSON *ex = cJSON_AddArrayToObject(out.get(), "exercises");
  cJSON *it;
  cJSON_ArrayForEach(it, exercises.get()) {
    cJSON *o = cJSON_CreateObject();
    jSetStr(o, "key", String(jInt(it, "id")).c_str());
    jSetStr(o, "name", jStr(it, "name", ""));
    jSetStr(o, "description", jStr(it, "description", ""));
    jSetNull(o, "image");
    cJSON_AddItemToArray(ex, o);
  }
  cJSON *se = cJSON_AddArrayToObject(out.get(), "stretchExercises");
  cJSON_ArrayForEach(it, stretchEx.get()) {
    cJSON *o = cJSON_CreateObject();
    jSetStr(o, "key", String(jInt(it, "id")).c_str());
    jSetStr(o, "name", jStr(it, "name", ""));
    jSetInt(o, "durationSec", jInt(it, "durationSec", 30));
    jSetNull(o, "image");
    cJSON_AddItemToArray(se, o);
  }
  cJSON *wo = cJSON_AddArrayToObject(out.get(), "workouts");
  cJSON_ArrayForEach(it, workouts.get()) {
    cJSON *o = cJSON_CreateObject();
    jSetStr(o, "name", jStr(it, "name", ""));
    jSetInt(o, "rounds", jInt(it, "rounds", 1));
    jSetInt(o, "restBetweenExercises", jInt(it, "restBetweenExercises"));
    jSetInt(o, "restBetweenRounds", jInt(it, "restBetweenRounds"));
    cJSON *items = cJSON_AddArrayToObject(o, "items");
    cJSON *i;
    cJSON_ArrayForEach(i, jget(it, "items")) {
      cJSON *x = cJSON_CreateObject();
      jSetStr(x, "exercise", String(jInt(i, "exerciseId")).c_str());
      jSetStr(x, "type", jStr(i, "type", "time"));
      jSetInt(x, "value", jInt(i, "value", 1));
      jSetInt(x, "sets", jInt(i, "sets", 1));
      cJSON_AddItemToArray(items, x);
    }
    cJSON_AddItemToArray(wo, o);
  }
  cJSON *st = cJSON_AddArrayToObject(out.get(), "stretchings");
  cJSON_ArrayForEach(it, stretchings.get()) {
    cJSON *o = cJSON_CreateObject();
    jSetStr(o, "name", jStr(it, "name", ""));
    cJSON *items = cJSON_AddArrayToObject(o, "items");
    cJSON *i;
    cJSON_ArrayForEach(i, jget(it, "items")) cJSON_AddItemToArray(items, cJSON_CreateString(String((int)i->valuedouble).c_str()));
    cJSON_AddItemToArray(st, o);
  }
  attachment("workouts-stretching");
  sendJson(out);
}

static void hExportProgress() {
  attachment("fortschritt");
  String now = isoNow();
  String prefix = "{\"format\":\"fitnessforhealth-progress\",\"version\":1,";
  if (now.length()) prefix += "\"exportedAt\":\"" + now + "\",";
  prefix += "\"executions\":[";
  streamExecutions(prefix.c_str(), "]}");
}

static String uniqueCopyName(const String &name, std::function<bool(const String &)> exists) {
  String candidate = name + " (Kopie)";
  int i = 2;
  while (exists(candidate)) candidate = name + " (Kopie " + String(i++) + ")";
  return candidate;
}

static cJSON *findByName(const cJSON *arr, const String &name) {
  cJSON *it;
  cJSON_ArrayForEach(it, arr) {
    if (name.equalsIgnoreCase(jStr(it, "name", ""))) return it;
  }
  return nullptr;
}

/** Prüft die Struktur einer Workout-/Stretching-Datei. */
static bool validatePlansFile(const cJSON *d) {
  if (!cJSON_IsObject(d) || !isOneOf(jStr(d, "format"), {"fitnessforhealth-plans"})) {
    sendError(400, "Die Datei ist kein Workout-/Stretching-Export.");
    return false;
  }
  if (jInt(d, "version", 99) > 1) {
    sendError(400, "Diese Dateiversion wird noch nicht unterstützt.");
    return false;
  }
  std::vector<String> exKeys, seKeys;
  cJSON *it;
  cJSON_ArrayForEach(it, jget(d, "exercises")) {
    if (!jStr(it, "name") || !strlen(jStr(it, "name"))) return sendError(400, "Eine Übung hat keinen Namen."), false;
    exKeys.push_back(jKey(jget(it, "key")));
  }
  cJSON_ArrayForEach(it, jget(d, "stretchExercises")) {
    if (!jStr(it, "name") || jInt(it, "durationSec") < 1) return sendError(400, "Eine Stretching-Übung ist ungültig."), false;
    seKeys.push_back(jKey(jget(it, "key")));
  }
  cJSON_ArrayForEach(it, jget(d, "workouts")) {
    if (!jStr(it, "name") || jInt(it, "rounds") < 1) return sendError(400, "Ein Workout ist ungültig."), false;
    cJSON *i;
    cJSON_ArrayForEach(i, jget(it, "items")) {
      if (std::find(exKeys.begin(), exKeys.end(), jKey(jget(i, "exercise"))) == exKeys.end())
        return sendError(400, String("Workout „") + jStr(it, "name") + "“ verweist auf eine unbekannte Übung."), false;
      if (!isOneOf(jStr(i, "type"), {"time", "reps"}) || jInt(i, "value") < 1 || jInt(i, "sets") < 1)
        return sendError(400, String("Workout „") + jStr(it, "name") + "“ enthält einen ungültigen Eintrag."), false;
    }
  }
  cJSON_ArrayForEach(it, jget(d, "stretchings")) {
    if (!jStr(it, "name")) return sendError(400, "Ein Stretching ist ungültig."), false;
    cJSON *i;
    cJSON_ArrayForEach(i, jget(it, "items")) {
      if (std::find(seKeys.begin(), seKeys.end(), jKey(i)) == seKeys.end())
        return sendError(400, String("Stretching „") + jStr(it, "name") + "“ verweist auf eine unbekannte Übung."), false;
    }
  }
  return true;
}

static void hImportPlansPreview() {
  JPtr b = body();
  cJSON *d = jget(b.get(), "data");
  if (!validatePlansFile(d)) return;
  struct Group {
    const char *key;
    const char *file;
    bool counts;
  };
  const Group groups[] = {{"exercises", F_EXERCISES, false},
                          {"stretchExercises", F_STRETCH_EXERCISES, false},
                          {"workouts", F_WORKOUTS, true},
                          {"stretchings", F_STRETCHINGS, true}};
  JPtr out(cJSON_CreateObject());
  for (const auto &g : groups) {
    JPtr existing = loadArray(g.file);
    cJSON *arr = cJSON_AddArrayToObject(out.get(), g.key);
    cJSON *it;
    cJSON_ArrayForEach(it, jget(d, g.key)) {
      cJSON *o = cJSON_CreateObject();
      jSetStr(o, "name", jStr(it, "name", ""));
      jSetBool(o, "conflict", findByName(existing.get(), jStr(it, "name", "")) != nullptr);
      if (g.counts) jSetInt(o, "itemCount", cJSON_GetArraySize(jget(it, "items")));
      cJSON_AddItemToArray(arr, o);
    }
  }
  sendJson(out);
}

static bool overwrite(const cJSON *decisions, const char *group, const char *name) {
  return isOneOf(jStr(jget(decisions, group), name), {"overwrite"});
}

static void hImportPlans() {
  JPtr b = body();
  cJSON *d = jget(b.get(), "data");
  cJSON *dec = jget(b.get(), "decisions");
  if (!validatePlansFile(d)) return;
  JPtr exercises = loadArray(F_EXERCISES);
  JPtr stretchEx = loadArray(F_STRETCH_EXERCISES);
  JPtr workouts = loadArray(F_WORKOUTS);
  JPtr stretchings = loadArray(F_STRETCHINGS);
  int created = 0, overwritten = 0;

  auto existsIn = [](cJSON *arr) { return [arr](const String &n) { return findByName(arr, n) != nullptr; }; };

  // Übungen: Schlüssel aus der Datei → ID auf dem Gerät
  std::vector<std::pair<String, int>> exIds, seIds;
  cJSON *it;
  cJSON_ArrayForEach(it, jget(d, "exercises")) {
    String name = jStr(it, "name", "");
    cJSON *existing = findByName(exercises.get(), name);
    cJSON *target;
    if (existing && overwrite(dec, "exercises", name.c_str())) {
      target = existing;
      overwritten++;
    } else {
      target = cJSON_CreateObject();
      jSetInt(target, "id", nextId(false));
      jSetStr(target, "name", existing ? uniqueCopyName(name, existsIn(exercises.get())).c_str() : name.c_str());
      cJSON_AddItemToArray(exercises.get(), target);
      created++;
    }
    jSetStr(target, "description", jStr(it, "description", ""));
    exIds.push_back({jKey(jget(it, "key")), jInt(target, "id")});
  }
  cJSON_ArrayForEach(it, jget(d, "stretchExercises")) {
    String name = jStr(it, "name", "");
    cJSON *existing = findByName(stretchEx.get(), name);
    cJSON *target;
    if (existing && overwrite(dec, "stretchExercises", name.c_str())) {
      target = existing;
      overwritten++;
    } else {
      target = cJSON_CreateObject();
      jSetInt(target, "id", nextId(false));
      jSetStr(target, "name", existing ? uniqueCopyName(name, existsIn(stretchEx.get())).c_str() : name.c_str());
      cJSON_AddItemToArray(stretchEx.get(), target);
      created++;
    }
    jSetInt(target, "durationSec", jInt(it, "durationSec", 30));
    seIds.push_back({jKey(jget(it, "key")), jInt(target, "id")});
  }
  auto lookup = [](const std::vector<std::pair<String, int>> &map, const String &key) {
    for (auto &p : map)
      if (p.first == key) return p.second;
    return 0;
  };

  cJSON_ArrayForEach(it, jget(d, "workouts")) {
    String name = jStr(it, "name", "");
    cJSON *existing = findByName(workouts.get(), name);
    cJSON *target;
    if (existing && overwrite(dec, "workouts", name.c_str())) {
      target = existing;
      overwritten++;
    } else {
      target = cJSON_CreateObject();
      jSetInt(target, "id", nextId(false));
      jSetStr(target, "name", existing ? uniqueCopyName(name, existsIn(workouts.get())).c_str() : name.c_str());
      cJSON_AddItemToArray(workouts.get(), target);
      created++;
    }
    jSetInt(target, "rounds", jInt(it, "rounds", 1));
    jSetInt(target, "restBetweenExercises", jInt(it, "restBetweenExercises"));
    jSetInt(target, "restBetweenRounds", jInt(it, "restBetweenRounds"));
    cJSON *items = cJSON_CreateArray();
    cJSON *i;
    cJSON_ArrayForEach(i, jget(it, "items")) {
      cJSON *x = cJSON_CreateObject();
      jSetInt(x, "exerciseId", lookup(exIds, jKey(jget(i, "exercise"))));
      jSetStr(x, "type", jStr(i, "type", "time"));
      jSetInt(x, "value", jInt(i, "value", 1));
      jSetInt(x, "sets", jInt(i, "sets", 1));
      cJSON_AddItemToArray(items, x);
    }
    jSet(target, "items", items);
  }
  cJSON_ArrayForEach(it, jget(d, "stretchings")) {
    String name = jStr(it, "name", "");
    cJSON *existing = findByName(stretchings.get(), name);
    cJSON *target;
    if (existing && overwrite(dec, "stretchings", name.c_str())) {
      target = existing;
      overwritten++;
    } else {
      target = cJSON_CreateObject();
      jSetInt(target, "id", nextId(false));
      jSetStr(target, "name", existing ? uniqueCopyName(name, existsIn(stretchings.get())).c_str() : name.c_str());
      cJSON_AddItemToArray(stretchings.get(), target);
      created++;
    }
    cJSON *items = cJSON_CreateArray();
    cJSON *i;
    cJSON_ArrayForEach(i, jget(it, "items")) cJSON_AddItemToArray(items, cJSON_CreateNumber(lookup(seIds, jKey(i))));
    jSet(target, "items", items);
  }

  saveMeta();
  if (!saveOrFail(F_EXERCISES, exercises.get()) || !saveOrFail(F_STRETCH_EXERCISES, stretchEx.get()) ||
      !saveOrFail(F_WORKOUTS, workouts.get()) || !saveOrFail(F_STRETCHINGS, stretchings.get()))
    return;
  sendText(200, String("{\"created\":") + created + ",\"overwritten\":" + overwritten + "}");
}

/** Fortschritt-Import (das Frontend schickt Pakete zu 100 Einträgen) */
static void hImportProgress(bool preview) {
  JPtr b = body();
  cJSON *d = jget(b.get(), "data");
  if (!cJSON_IsObject(d) || !isOneOf(jStr(d, "format"), {"fitnessforhealth-progress"}))
    return sendError(400, "Die Datei ist kein Fortschritts-Export.");
  if (jInt(d, "version", 99) > 1) return sendError(400, "Diese Dateiversion wird noch nicht unterstützt.");
  cJSON *list = jget(d, "executions");
  if (!cJSON_IsArray(list)) return sendError(400, "Die Datei enthält keine Einträge.");
  // erst alles prüfen
  cJSON *it;
  cJSON_ArrayForEach(it, list) {
    JPtr e = parseExecution(it, false);
    if (!e) return sendError(400, "Die Datei enthält einen ungültigen Eintrag.");
  }
  std::vector<uint32_t> hashes = executionHashes();
  int total = 0, dup = 0;
  cJSON_ArrayForEach(it, list) {
    total++;
    uint32_t h = executionHash(jStr(it, "kind", ""), jStr(it, "name", ""), jStr(it, "startedAt", ""));
    auto pos = std::lower_bound(hashes.begin(), hashes.end(), h);
    if (pos != hashes.end() && *pos == h) {
      dup++;
      continue;
    }
    hashes.insert(pos, h);
    if (!preview) {
      JPtr e = parseExecution(it, false);
      jSetInt(e.get(), "id", nextId(false));
      if (!appendExecution(e.get())) {
        saveMeta();
        return sendError(507, "Speichern fehlgeschlagen. Ist der Speicher voll?");
      }
    }
  }
  if (!preview) {
    saveMeta();
    return sendText(200, String("{\"imported\":") + (total - dup) + ",\"skipped\":" + dup + "}");
  }
  sendText(200, String("{\"total\":") + total + ",\"duplicates\":" + dup + ",\"new\":" + (total - dup) + "}");
}

// ---------- Statische Dateien (Frontend, gzip) ----------

static void serveStatic(const String &uri) {
  const WebAsset *asset = nullptr;
  const WebAsset *index = nullptr;
  for (size_t i = 0; i < WEB_ASSET_COUNT; i++) {
    if (uri == WEB_ASSETS[i].path) asset = &WEB_ASSETS[i];
    if (strcmp(WEB_ASSETS[i].path, "/index.html") == 0) index = &WEB_ASSETS[i];
  }
  // Unbekannte Pfade liefern die App aus (Routing im Browser)
  if (!asset) asset = index;
  if (!asset) return S->send(500, "text/plain", "Frontend fehlt in der Firmware.");
  bool immutable = uri.startsWith("/assets/");
  S->sendHeader("Cache-Control", immutable ? "public, max-age=31536000, immutable" : "no-cache");
  S->sendHeader("Content-Encoding", "gzip");
  S->send_P(200, asset->mime, (PGM_P)asset->data, asset->len);
}

// ---------- Router ----------

static void route() {
  String uri = S->uri();
  HTTPMethod m = S->method();
  if (!uri.startsWith("/api/")) return serveStatic(uri);

  std::vector<String> seg;
  int start = 5;
  while (start <= (int)uri.length()) {
    int slash = uri.indexOf('/', start);
    if (slash < 0) slash = uri.length();
    if (slash > start) seg.push_back(uri.substring(start, slash));
    start = slash + 1;
  }
  if (seg.empty()) return sendError(404, "Nicht gefunden.");
  const String &r = seg[0];

  if (r == "health") {
    JPtr h(cJSON_CreateObject());
    jSetBool(h.get(), "ok", true);
    jSetStr(h.get(), "version", FFH_VERSION);
    jSetInt(h.get(), "freeHeap", ESP.getFreeHeap());
    jSetInt(h.get(), "storageUsed", fsUsedBytes());
    jSetInt(h.get(), "storageTotal", fsTotalBytes());
    return sendJson(h);
  }
  if (r == "login" && m == HTTP_POST) return hLogin();
  if (r == "logout" && m == HTTP_POST) return hLogout();
  if (r == "users" && m == HTTP_GET) {
    // Kompatibilität: genau ein Benutzer
    JPtr list(cJSON_CreateArray());
    JPtr p = profile();
    cJSON_AddItemToArray(list.get(), p.release());
    return sendJson(list);
  }

  if (!authorized()) return sendError(401, "Bitte zuerst anmelden.");

  if (r == "me" && seg.size() == 1 && m == HTTP_GET) return sendJson(profile());
  if (r == "me" && seg.size() == 1 && m == HTTP_PUT) return hUpdateProfile();
  if (r == "exercises") return hExercises(seg, m);
  if (r == "stretch-exercises") return hStretchExercises(seg, m);
  if (r == "workouts") return hWorkouts(seg, m);
  if (r == "stretchings") return hStretchings(seg, m);
  if (r == "executions") return hExecutions(seg, m);
  if (r == "activity-types") return hActivities(seg, m);
  if (r == "plans") return hPlans(seg, m);
  if (r == "export" && seg.size() == 2 && m == HTTP_GET) {
    if (seg[1] == "plans") return hExportPlans();
    if (seg[1] == "progress") return hExportProgress();
  }
  if (r == "import" && m == HTTP_POST && seg.size() >= 2) {
    bool preview = seg.size() == 3 && seg[2] == "preview";
    if (seg[1] == "plans") return preview ? hImportPlansPreview() : hImportPlans();
    if (seg[1] == "progress") return hImportProgress(preview);
  }
  sendError(404, "Nicht gefunden.");
}

void apiBegin(WebServer &server) {
  S = &server;
  static const char *headers[] = {"Cookie"};
  server.collectHeaders(headers, 1);
  server.onNotFound(route);
}
