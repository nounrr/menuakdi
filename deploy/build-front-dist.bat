@echo off
setlocal

set API_URL=%1
if "%API_URL%"=="" set API_URL=https://api.example.com/api

echo Building frontend with API: %API_URL%
set VITE_API_BASE_URL=%API_URL%

call npm install
if errorlevel 1 exit /b 1

call npm run build
if errorlevel 1 exit /b 1

if exist deploy\front-dist rmdir /s /q deploy\front-dist
xcopy dist deploy\front-dist\ /e /i /y

echo.
echo Frontend ready in deploy\front-dist
echo Upload the contents of deploy\front-dist to the separate Hostinger hosting.
endlocal
