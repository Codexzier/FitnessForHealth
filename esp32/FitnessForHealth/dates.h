#pragma once
// Kalenderrechnung ohne Uhrzeit (gleiche Logik wie im Node-Server).
#include <Arduino.h>

inline long daysFromCivil(int y, unsigned m, unsigned d) {
  y -= m <= 2;
  const long era = (y >= 0 ? y : y - 399) / 400;
  const unsigned yoe = (unsigned)(y - era * 400);
  const unsigned doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
  const unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  return era * 146097 + (long)doe - 719468;
}

/** "JJJJ-MM-TT" → Tage seit 1970-01-01 */
inline bool parseDate(const char *s, long &days) {
  if (!s || strlen(s) != 10 || s[4] != '-' || s[7] != '-') return false;
  int y, m, d;
  if (sscanf(s, "%4d-%2d-%2d", &y, &m, &d) != 3 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  days = daysFromCivil(y, m, d);
  return true;
}

/** 1 = Montag … 7 = Sonntag */
inline int weekdayOf(long days) {
  long w = (days + 3) % 7;  // 1970-01-01 war ein Donnerstag
  if (w < 0) w += 7;
  return (int)w + 1;
}

/** Woche im Plan, 1-basiert */
inline int weekOf(long startDays, long days) {
  long diff = days - startDays;
  long weeks = diff >= 0 ? diff / 7 : -((-diff + 6) / 7);
  return (int)weeks + 1;
}

/** Sortierschlüssel aus einem ISO-Zeitstempel "JJJJ-MM-TTTHH:MM:SS…" (Sekunden) */
inline int64_t isoKey(const char *s) {
  long days;
  if (!s || strlen(s) < 10) return 0;
  char date[11];
  memcpy(date, s, 10);
  date[10] = 0;
  if (!parseDate(date, days)) return 0;
  int h = 0, mi = 0, se = 0;
  if (strlen(s) >= 19) sscanf(s + 11, "%2d:%2d:%2d", &h, &mi, &se);
  return (int64_t)days * 86400 + h * 3600 + mi * 60 + se;
}
