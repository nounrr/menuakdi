@echo off
setlocal

set API_URL=%1
if "%API_URL%"=="" (
  echo Usage: deploy\build-front-dist-https-api.bat https://api.your-domain.com
  exit /b 1
)

call deploy\build-front-dist.bat %API_URL%

endlocal
