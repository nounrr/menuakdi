@echo off
setlocal

set PORT=5000
set VITE_API_BASE_URL=http://localhost:5000/api
set CLIENT_ORIGIN=http://localhost:5174

echo Starting backend on %PORT% and frontend on 5174...
call npm run dev
endlocal
