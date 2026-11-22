// Host-Simulation: Umsetzung der Nachbildungen und Startpunkt.
// Bauen und starten:  make -C esp32/host run   (App dann unter http://localhost:8096)
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/stat.h>
#include <sys/socket.h>
#include <unistd.h>
#include <chrono>
#include <random>
#include <thread>
#include <LittleFS.h>
#include <WebServer.h>
#include "api.h"
#include "store.h"

EspClass ESP;
LittleFSClass LittleFS;

void delay(unsigned long ms) { std::this_thread::sleep_for(std::chrono::milliseconds(ms)); }
unsigned long millis() {
  using namespace std::chrono;
  return (unsigned long)duration_cast<milliseconds>(steady_clock::now().time_since_epoch()).count();
}
uint32_t esp_random() {
  static std::random_device rd;
  return rd();
}

// ---------- LittleFS ----------

static std::string dataDir() {
  const char *d = getenv("FFH_DATA");
  return d ? d : "data-host";
}
static std::string full(const String &p) { return dataDir() + p.s; }

bool LittleFSClass::begin(bool) {
  mkdir(dataDir().c_str(), 0755);
  return true;
}
File LittleFSClass::open(const String &path, const char *mode) {
  std::string m = mode[0] == 'r' ? "rb" : mode[0] == 'a' ? "ab" : "wb";
  return File(fopen(full(path).c_str(), m.c_str()));
}
bool LittleFSClass::exists(const String &path) {
  struct stat st;
  return stat(full(path).c_str(), &st) == 0;
}
bool LittleFSClass::remove(const String &path) { return ::remove(full(path).c_str()) == 0; }
bool LittleFSClass::rename(const String &a, const String &b) { return ::rename(full(a).c_str(), full(b).c_str()) == 0; }
size_t LittleFSClass::usedBytes() { return 0; }

String File::readString() {
  std::string out;
  char buf[4096];
  size_t n;
  while (f && (n = fread(buf, 1, sizeof buf, f)) > 0) out.append(buf, n);
  return String(out);
}
String File::readStringUntil(char c) {
  std::string out;
  int ch;
  while (f && (ch = fgetc(f)) != EOF && ch != c) out += (char)ch;
  return String(out);
}
int File::available() {
  if (!f) return 0;
  int ch = fgetc(f);
  if (ch == EOF) return 0;
  ungetc(ch, f);
  return 1;
}

// ---------- WebServer ----------

void WebServer::begin() {
  _listen = socket(AF_INET, SOCK_STREAM, 0);
  int one = 1;
  setsockopt(_listen, SOL_SOCKET, SO_REUSEADDR, &one, sizeof one);
  sockaddr_in addr{};
  addr.sin_family = AF_INET;
  addr.sin_port = htons(_port);
  addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  if (bind(_listen, (sockaddr *)&addr, sizeof addr) < 0 || listen(_listen, 16) < 0) {
    perror("bind/listen");
    exit(1);
  }
}

static bool readLine(int fd, std::string &line) {
  line.clear();
  char c;
  while (recv(fd, &c, 1, 0) == 1) {
    if (c == '\n') return true;
    if (c != '\r') line += c;
  }
  return false;
}

void WebServer::handleClient() {
  _client = accept(_listen, nullptr, nullptr);
  if (_client < 0) return;
  std::string line;
  if (!readLine(_client, line)) {
    close(_client);
    return;
  }
  char method[16], target[2048];
  sscanf(line.c_str(), "%15s %2047s", method, target);
  std::string m = method, t = target;
  _method = m == "POST" ? HTTP_POST : m == "PUT" ? HTTP_PUT : m == "DELETE" ? HTTP_DELETE : HTTP_GET;
  _uri = String(t.substr(0, t.find('?')));
  _headers.clear();
  size_t len = 0;
  while (readLine(_client, line) && !line.empty()) {
    auto p = line.find(':');
    if (p == std::string::npos) continue;
    std::string k = line.substr(0, p), v = line.substr(p + 1);
    v.erase(0, v.find_first_not_of(' '));
    for (auto &ch : k) ch = (char)tolower(ch);
    _headers[k] = v;
    if (k == "content-length") len = std::stoul(v);
  }
  std::string body(len, '\0');
  size_t got = 0;
  while (got < len) {
    ssize_t n = recv(_client, &body[got], len - got, 0);
    if (n <= 0) break;
    got += n;
  }
  _body = String(body);
  _extraHeaders = "";
  _contentLength = 0;
  _chunked = false;
  if (_handler) _handler();
  close(_client);
  _client = -1;
}

String WebServer::header(const String &name) {
  std::string k = name.s;
  for (auto &ch : k) ch = (char)tolower(ch);
  auto it = _headers.find(k);
  return it == _headers.end() ? String() : String(it->second);
}

void WebServer::writeAll(const char *data, size_t len) {
  while (len > 0) {
    ssize_t n = ::send(_client, data, len, MSG_NOSIGNAL);
    if (n <= 0) return;
    data += n;
    len -= n;
  }
}

void WebServer::writeHead(int code, const char *type, size_t len) {
  String h = String("HTTP/1.1 ") + code + " OK\r\nContent-Type: " + type + "\r\n" + _extraHeaders + "Connection: close\r\n";
  if (len == CONTENT_LENGTH_UNKNOWN) {
    h += "Transfer-Encoding: chunked\r\n";
    _chunked = true;
  } else {
    h += String("Content-Length: ") + (int)len + "\r\n";
  }
  h += "\r\n";
  writeAll(h.c_str(), h.length());
}

void WebServer::send(int code, const char *type, const String &content) {
  if (_contentLength == CONTENT_LENGTH_UNKNOWN) {
    writeHead(code, type, CONTENT_LENGTH_UNKNOWN);
    if (content.length()) sendContent(content);
  } else {
    writeHead(code, type, content.length());
    writeAll(content.c_str(), content.length());
  }
}

void WebServer::send_P(int code, PGM_P type, PGM_P data, size_t len) {
  writeHead(code, type, len);
  writeAll(data, len);
}

void WebServer::sendContent(const String &content) {
  if (!_chunked) return writeAll(content.c_str(), content.length());
  char size[16];
  snprintf(size, sizeof size, "%zx\r\n", content.length());
  writeAll(size, strlen(size));
  writeAll(content.c_str(), content.length());
  writeAll("\r\n", 2);
  if (content.length() == 0) _chunked = false;
}

// ---------- Start ----------

int main(int argc, char **argv) {
  int port = argc > 1 ? atoi(argv[1]) : 8096;
  if (!storeBegin()) return 1;
  WebServer server(port);
  apiBegin(server);
  server.begin();
  printf("FitnessForHealth Host-Simulation: http://localhost:%d (Daten: %s)\n", port, getenv("FFH_DATA") ? getenv("FFH_DATA") : "data-host");
  fflush(stdout);
  for (;;) server.handleClient();
}
