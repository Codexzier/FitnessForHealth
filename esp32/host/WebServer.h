// Host-Simulation: einfacher HTTP-Server mit der Schnittstelle der ESP32-WebServer-Klasse.
#pragma once
#include <Arduino.h>
#include <map>
#include <vector>

enum HTTPMethod { HTTP_ANY, HTTP_GET, HTTP_HEAD, HTTP_POST, HTTP_PUT, HTTP_PATCH, HTTP_DELETE, HTTP_OPTIONS };
#define CONTENT_LENGTH_UNKNOWN ((size_t)-1)

class WebServer {
 public:
  explicit WebServer(int port) : _port(port) {}
  void begin();
  void handleClient();
  void onNotFound(std::function<void()> fn) { _handler = fn; }
  void collectHeaders(const char *headers[], size_t count) {}
  String header(const String &name);
  String arg(const String &name) { return name == "plain" ? _body : String(); }
  String uri() { return _uri; }
  HTTPMethod method() { return _method; }
  void sendHeader(const String &name, const String &value) { _extraHeaders += name + ": " + value + "\r\n"; }
  void setContentLength(size_t len) { _contentLength = len; }
  void send(int code, const char *type, const String &content);
  void send(int code, const char *type, const char *content) { send(code, type, String(content)); }
  void send_P(int code, PGM_P type, PGM_P data, size_t len);
  void sendContent(const String &content);

 private:
  int _port, _listen = -1, _client = -1;
  std::function<void()> _handler;
  String _uri, _body, _extraHeaders;
  HTTPMethod _method = HTTP_GET;
  std::map<std::string, std::string> _headers;
  size_t _contentLength = 0;
  bool _chunked = false;
  void writeAll(const char *data, size_t len);
  void writeHead(int code, const char *type, size_t len);
};
