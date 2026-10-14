@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>&1
if errorlevel 1 (
  echo Node.js is missing. Install Node.js before starting Shiyin.
  pause
  exit /b 1
)
if not exist "node_modules\vite\bin\vite.js" (
  echo Dependencies are missing. Run npm install in this folder first.
  pause
  exit /b 1
)
echo Shiyin: http://127.0.0.1:5188/
echo Keep this window open while using Shiyin.
node "node_modules\vite\bin\vite.js" --host 127.0.0.1 --port 5188 --strictPort --open
if errorlevel 1 (
  echo Startup failed. If Shiyin is already running, open http://127.0.0.1:5188/
  pause
  exit /b 1
)
