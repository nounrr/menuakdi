@echo off
setlocal

set VPS_HOST=148.230.125.221
set VPS_USER=root
set APP_DIR=/var/www/menu-paradise-api
set API_PUBLIC_URL=http://148.230.125.221:3304
set FRONT_ORIGIN=%1
if "%FRONT_ORIGIN%"=="" set FRONT_ORIGIN=https://www.example.com

echo.
echo Deploying backend to %VPS_USER%@%VPS_HOST%
echo App dir: %APP_DIR%
echo API URL: %API_PUBLIC_URL%
echo Front origin: %FRONT_ORIGIN%
echo.

where ssh >nul 2>nul
if errorlevel 1 (
  echo ssh command not found. Install OpenSSH Client on Windows.
  exit /b 1
)

where scp >nul 2>nul
if errorlevel 1 (
  echo scp command not found. Install OpenSSH Client on Windows.
  exit /b 1
)

if exist deploy\menu-paradise-api.tar.gz del /q deploy\menu-paradise-api.tar.gz

echo Creating archive...
tar ^
  --exclude=node_modules ^
  --exclude=.git ^
  --exclude=dist ^
  --exclude=deploy/menu-paradise-api.tar.gz ^
  -czf deploy\menu-paradise-api.tar.gz .
if errorlevel 1 goto error

echo Uploading archive...
scp deploy\menu-paradise-api.tar.gz %VPS_USER%@%VPS_HOST%:/tmp/menu-paradise-api.tar.gz
if errorlevel 1 goto error

echo Installing on VPS...
ssh %VPS_USER%@%VPS_HOST% "mkdir -p %APP_DIR% && tar -xzf /tmp/menu-paradise-api.tar.gz -C %APP_DIR% && cd %APP_DIR% && bash deploy/hostinger-backend-setup.sh %APP_DIR% %API_PUBLIC_URL% %FRONT_ORIGIN% 3304"
if errorlevel 1 goto error

echo.
echo Done.
echo API: %API_PUBLIC_URL%/api/health
echo.
goto end

:error
echo.
echo Deploy failed. Check SSH access, VPS password/key, and MySQL config on server.
exit /b 1

:end
endlocal
