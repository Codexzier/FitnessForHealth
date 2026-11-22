#pragma once
#include <WebServer.h>

/** Registriert alle Routen (REST-API und Frontend) am Webserver. */
void apiBegin(WebServer &server);
