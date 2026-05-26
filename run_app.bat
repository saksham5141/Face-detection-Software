@echo off
echo Starting Saksham AI Face Detect server...
echo.
echo Please keep this window open while using the app.
echo To close the server, press Ctrl+C or close this window.
echo.

:: Start python server in the background and open browser
start "" http://localhost:8080
python -m http.server 8080
