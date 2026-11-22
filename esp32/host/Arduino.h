// Host-Simulation: minimale Nachbildung der Arduino-Umgebung, damit api.cpp und store.cpp
// unverändert auf dem PC laufen. Nur für Tests – nicht Teil der Firmware.
#pragma once
#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <functional>
#include <string>

#define PROGMEM
typedef const char *PGM_P;

class String {
 public:
  std::string s;
  String() {}
  String(const char *c) : s(c ? c : "") {}
  String(const std::string &x) : s(x) {}
  String(char c) : s(1, c) {}
  String(int v) : s(std::to_string(v)) {}
  String(unsigned v) : s(std::to_string(v)) {}
  String(long v) : s(std::to_string(v)) {}
  String(unsigned long v) : s(std::to_string(v)) {}
  size_t length() const { return s.size(); }
  const char *c_str() const { return s.c_str(); }
  char operator[](size_t i) const { return i < s.size() ? s[i] : 0; }
  int indexOf(const char *x, size_t from = 0) const {
    auto p = s.find(x, from);
    return p == std::string::npos ? -1 : (int)p;
  }
  int indexOf(char c, size_t from = 0) const {
    auto p = s.find(c, from);
    return p == std::string::npos ? -1 : (int)p;
  }
  String substring(size_t a, size_t b = std::string::npos) const {
    if (a >= s.size()) return String();
    return String(s.substr(a, b == std::string::npos ? std::string::npos : b - a));
  }
  bool startsWith(const String &x) const { return s.rfind(x.s, 0) == 0; }
  bool equalsIgnoreCase(const String &x) const {
    if (x.s.size() != s.size()) return false;
    for (size_t i = 0; i < s.size(); i++)
      if (tolower((unsigned char)s[i]) != tolower((unsigned char)x.s[i])) return false;
    return true;
  }
  void trim() {
    size_t a = s.find_first_not_of(" \t\r\n");
    size_t b = s.find_last_not_of(" \t\r\n");
    s = a == std::string::npos ? "" : s.substr(a, b - a + 1);
  }
  long toInt() const { return atol(s.c_str()); }
  String &operator+=(const String &x) { s += x.s; return *this; }
  String &operator+=(const char *x) { s += x; return *this; }
  String &operator+=(char c) { s += c; return *this; }
  bool operator==(const String &x) const { return s == x.s; }
  bool operator==(const char *x) const { return s == (x ? x : ""); }
  bool operator!=(const String &x) const { return s != x.s; }
  bool operator<(const String &x) const { return s < x.s; }
};
inline String operator+(String a, const String &b) { return a += b; }
inline String operator+(String a, const char *b) { return a += b; }
inline String operator+(const char *a, const String &b) { return String(a) += b; }
inline String operator+(String a, int b) { return a += String(b); }

inline bool isDigit(char c) { return c >= '0' && c <= '9'; }
using std::max;
using std::min;
void delay(unsigned long ms);
unsigned long millis();
uint32_t esp_random();

struct EspClass {
  uint32_t getFreeHeap() { return 300000; }
};
extern EspClass ESP;
