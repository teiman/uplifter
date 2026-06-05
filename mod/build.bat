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
REM fteqcc escribe progs.dat/csprogs.dat en el DIRECTORIO ACTUAL, no en el del
REM .src. Si build.bat se lanza desde otra carpeta, los .dat caerian alli y los
REM 'move' de abajo no los encontrarian. Forzamos el cwd a la carpeta del mod
REM (%HERE%) para que siempre se generen donde esperamos. El 'popd' al final
REM (etiqueta :compile_done) restaura el directorio anterior.
pushd "%HERE%"

echo [build] Compilando SSQC (progs.dat)...
"%FTEQCC%" -src "%HERE%src"
if errorlevel 1 ( echo [build] Fallo SSQC & popd & exit /b 1 )
echo [build] Compilando CSQC (csprogs.dat)...
"%FTEQCC%" -srcfile "%HERE%csrc\csprogs.src"
if errorlevel 1 ( echo [build] Fallo CSQC & popd & exit /b 1 )

REM Copia (no 'move') los dos .dat al install. Usamos copy para que un fallo a
REM medias deje el .dat fuente intacto y el siguiente intento lo reintente.
if exist "%HERE%progs.dat" (
    copy /Y "%HERE%progs.dat" "%INSTALL_DIR%\PROGS.DAT" >nul && echo   progs.dat -^> %INSTALL_DIR%\PROGS.DAT
) else (
    echo [build] No se genero progs.dat & popd & exit /b 1
)
if exist "%HERE%csprogs.dat" (
    copy /Y "%HERE%csprogs.dat" "%INSTALL_DIR%\csprogs.dat" >nul && echo   csprogs.dat -^> %INSTALL_DIR%\csprogs.dat
) else (
    echo [build] No se genero csprogs.dat & popd & exit /b 1
)
REM Limpia los .dat intermedios de la carpeta del mod (ya copiados al install)
REM para no dejar residuos versionables.
del /Q "%HERE%progs.dat" "%HERE%csprogs.dat" >nul 2>&1
popd
echo [build] OK. progs.dat y csprogs.dat regenerados y copiados a %INSTALL_DIR%.
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
