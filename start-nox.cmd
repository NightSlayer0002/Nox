@echo off
setlocal
cd /d "%~dp0"
call npm start
set "NOX_EXIT_CODE=%ERRORLEVEL%"
if not "%NOX_EXIT_CODE%"=="0" echo NOX could not start. Review the error above.
pause
exit /b %NOX_EXIT_CODE%
