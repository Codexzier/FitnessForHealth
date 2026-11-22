// Host-Simulation: LittleFS auf ein normales Verzeichnis abgebildet (FFH_DATA, Standard ./data-host).
#pragma once
#include <Arduino.h>

class File {
 public:
  FILE *f = nullptr;
  File() {}
  explicit File(FILE *fp) : f(fp) {}
  explicit operator bool() const { return f != nullptr; }
  String readString();
  String readStringUntil(char c);
  int available();
  size_t position() { return f ? ftell(f) : 0; }
  bool seek(size_t pos) { return f && fseek(f, (long)pos, SEEK_SET) == 0; }
  size_t print(const char *s) { return f ? fwrite(s, 1, strlen(s), f) : 0; }
  size_t print(const String &s) { return print(s.c_str()); }
  size_t print(char c) { return f ? fwrite(&c, 1, 1, f) : 0; }
  void close() {
    if (f) fclose(f);
    f = nullptr;
  }
};

class LittleFSClass {
 public:
  bool begin(bool formatOnFail = false);
  File open(const String &path, const char *mode);
  bool exists(const String &path);
  bool remove(const String &path);
  bool rename(const String &from, const String &to);
  size_t usedBytes();
  size_t totalBytes() { return 1572864; }
};
extern LittleFSClass LittleFS;
