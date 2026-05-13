@echo off
title VOIDFRAME - AI Video Generator
color 0A
cls

echo.
echo  ██╗   ██╗ ██████╗ ██╗██████╗ ███████╗██████╗  █████╗ ███╗   ███╗███████╗
echo  ██║   ██║██╔═══██╗██║██╔══██╗██╔════╝██╔══██╗██╔══██╗████╗ ████║██╔════╝
echo  ██║   ██║██║   ██║██║██║  ██║█████╗  ██████╔╝███████║██╔████╔██║█████╗  
echo  ╚██╗ ██╔╝██║   ██║██║██║  ██║██╔══╝  ██╔══██╗██╔══██║██║╚██╔╝██║██╔══╝  
echo   ╚████╔╝ ╚██████╔╝██║██████╔╝██║     ██║  ██║██║  ██║██║ ╚═╝ ██║███████╗
echo    ╚═══╝   ╚═════╝ ╚═╝╚═════╝ ╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝
echo.
echo  Zero-Budget AI Video Generator
echo  ================================================
echo.

REM ── Klasör kontrolü ─────────────────────────────
set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "FRONTEND=%ROOT%frontend"

if not exist "%BACKEND%\package.json" (
    echo [HATA] backend\package.json bulunamadi!
    echo Dogru klasorde misiniz? %ROOT%
    pause
    exit /b 1
)

if not exist "%FRONTEND%\package.json" (
    echo [HATA] frontend\package.json bulunamadi!
    pause
    exit /b 1
)

REM ── Node.js kontrolü ────────────────────────────
echo [1/5] Node.js kontrol ediliyor...
node --version >nul 2>&1
if errorlevel 1 (
    echo [HATA] Node.js bulunamadi! https://nodejs.org adresinden yukleyin.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do echo       %%v - OK

REM ── FFmpeg kontrolü ─────────────────────────────
echo [2/5] FFmpeg kontrol ediliyor...
ffmpeg -version >nul 2>&1
if errorlevel 1 (
    echo [UYARI] FFmpeg bulunamadi. Placeholder video olusturulamaz.
    echo         https://ffmpeg.org/download.html adresinden yukleyip PATH'e ekleyin.
) else (
    echo       FFmpeg - OK
)

REM ── Backend npm install ──────────────────────────
echo [3/5] Backend bagimliliklar yukleniyor...
cd /d "%BACKEND%"
if not exist "node_modules" (
    call npm install --legacy-peer-deps
    if errorlevel 1 (
        echo [HATA] Backend npm install basarisiz!
        pause
        exit /b 1
    )
) else (
    echo       node_modules mevcut - atlanıyor
)

REM ── Backend .env ────────────────────────────────
if not exist ".env" (
    echo PORT=4000> .env
    echo NODE_ENV=development>> .env
    echo       .env olusturuldu
)

REM ── Frontend npm install ─────────────────────────
echo [4/5] Frontend bagimliliklar yukleniyor...
cd /d "%FRONTEND%"
if not exist "node_modules" (
    call npm install --legacy-peer-deps
    if errorlevel 1 (
        echo [HATA] Frontend npm install basarisiz!
        pause
        exit /b 1
    )
) else (
    echo       node_modules mevcut - atlanıyor
)

REM ── Frontend .env.local ──────────────────────────
if not exist ".env.local" (
    echo NEXT_PUBLIC_BACKEND_URL=http://localhost:4000> .env.local
    echo       .env.local olusturuldu
)

REM ── Servisleri baslat ───────────────────────────
echo [5/5] Servisler baslatiliyor...
echo.

REM Backend penceresi
start "VOIDFRAME Backend :4000" cmd /k "color 0A && cd /d "%BACKEND%" && echo [BACKEND] Baslatiliyor... && node server.js"

REM 3 saniye bekle
echo       Backend baslatiliyor (3s)...
timeout /t 3 /nobreak >nul

REM Frontend penceresi  
start "VOIDFRAME Frontend :3000" cmd /k "color 0B && cd /d "%FRONTEND%" && echo [FRONTEND] Baslatiliyor... && npm run dev"

REM 5 saniye bekle, tarayici ac
echo       Frontend baslatiliyor (5s)...
timeout /t 5 /nobreak >nul

echo.
echo  ================================================
echo   VOIDFRAME calisiyor!
echo   Tarayici aciliyor: http://localhost:3000
echo  ================================================
echo.

start "" "http://localhost:3000"

echo  Kapatmak icin bu pencereyi kapatabilirsiniz.
echo  Backend ve Frontend ayri pencerelerde calisiyor.
echo.
pause
