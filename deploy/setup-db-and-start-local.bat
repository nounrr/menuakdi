@echo off
setlocal

set PORT=5000
set VITE_API_BASE_URL=http://localhost:5000/api
set CLIENT_ORIGIN=http://localhost:5174

echo.
echo === Menu Paradise local setup ===
echo Backend: http://localhost:%PORT%
echo Frontend: http://localhost:5174
echo.

if not exist .env (
  echo Creating .env from .env.example
  copy .env.example .env >nul
)

echo Installing dependencies...
call npm install
if errorlevel 1 goto error

echo.
echo Creating database and running migrations...
call npm run db:migrate
if errorlevel 1 goto error

echo.
echo Importing menu data from Excel...
call npm run db:import
if errorlevel 1 goto error

echo.
echo Assigning dish images...
call npm run db:assign-images
if errorlevel 1 goto error

echo.
echo Creating/updating admin user...
call npm run db:seed-admin
if errorlevel 1 goto error

echo.
echo Building frontend once...
call npm run build
if errorlevel 1 goto error

echo.
echo Setup complete. Starting frontend and backend...
echo Open: http://localhost:5174/
echo Admin: http://localhost:5174/admin
echo.
call npm run dev
goto end

:error
echo.
echo Setup failed. Check MySQL credentials in .env and make sure MySQL is running.
exit /b 1

:end
endlocal
