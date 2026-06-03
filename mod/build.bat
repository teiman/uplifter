@echo off
REM Uplifter - build / deploy / run tool.
REM
REM Uso:
REM   build.bat               -> compile (default)
REM   build.bat compile       -> compila SSQC (progs.dat) y CSQC (csprogs.dat)
REM   build.bat deploy        -> copia .dat al install
REM   build.bat run [map]     -> lanza ironwail con el mod (map por defecto: uplifter)
REM   build.bat all [map]     -> compile + deploy + run
REM
REM Los .bsp los escribe el ModEditor directamente en D:\quake\uplifter\maps\;
REM no los gestiona este script.

setlocal EnableDelayedExpansion
set HERE=%~dp0
set QUAKE_DIR=D:\quake
set INSTALL_DIR=%QUAKE_DIR%\uplifter
set ENGINE=%QUAKE_DIR%\ironwail.exe
set FTEQCC=%HERE%bin\fteqcc64.exe

set CMD=%~1
if "%CMD%"=="" set CMD=compile
set MAP=%~2
if "%MAP%"=="" set MAP=uplifter

if /I "%CMD%"=="compile" goto :compile
if /I "%CMD%"=="deploy"  goto :deploy
if /I "%CMD%"=="run"     goto :run
if /I "%CMD%"=="all"     goto :all
echo [build] Comando desconocido: %CMD%
echo Comandos: compile ^| deploy ^| run ^| all
exit /b 1

:compile
if not exist "%FTEQCC%" (
    echo [build] No encuentro %FTEQCC%
    exit /b 1
)
echo [build] Compilando SSQC (progs.dat)...
"%FTEQCC%" -src "%HERE%src"
if errorlevel 1 ( echo [build] Fallo SSQC & exit /b 1 )
echo [build] Compilando CSQC (csprogs.dat)...
"%FTEQCC%" -srcfile "%HERE%csrc\csprogs.src"
if errorlevel 1 ( echo [build] Fallo CSQC & exit /b 1 )
if exist "%HERE%progs.dat" (
    move /Y "%HERE%progs.dat" "%INSTALL_DIR%\PROGS.DAT" >nul && echo   progs.dat -^> %INSTALL_DIR%\PROGS.DAT
) else (
    echo [build] No se gener progs.dat & exit /b 1
)
if exist "%HERE%csprogs.dat" (
    move /Y "%HERE%csprogs.dat" "%INSTALL_DIR%\csprogs.dat" >nul && echo   csprogs.dat -^> %INSTALL_DIR%\csprogs.dat
) else (
    echo [build] No se gener csprogs.dat & exit /b 1
)
echo [build] OK. progs.dat y csprogs.dat regenerados.
goto :eof

:deploy
echo [build] Deploy ya lo hace 'compile' (mueve los .dat a %INSTALL_DIR%).
goto :eof

:run
echo [build] Lanzando ironwail con map %MAP%...
"%ENGINE%" -basedir "%QUAKE_DIR%" -game uplifter +map %MAP%
goto :eof

:all
call "%~f0" compile || exit /b 1
call "%~f0" run %MAP%
goto :eof
