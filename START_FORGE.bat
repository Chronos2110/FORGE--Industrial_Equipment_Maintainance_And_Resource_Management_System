@echo off
title FORGE Industrial System Launcher
cd /d "%~dp0"
echo ========================================================
echo   Starting FORGE Industrial Maintenance System...
echo   Connecting to MongoDB Atlas...
echo ========================================================
start "" "http://localhost:5000/login.html"
node server.js
pause
