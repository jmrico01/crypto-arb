@echo off

where cl
if %ERRORLEVEL% NEQ 0 call "C:\Program Files (x86)\Microsoft Visual Studio 14.0\VC\vcvarsall.bat" x64

set DEFINES=/D_CRT_SECURE_NO_WARNINGS
set FLAGS=/nologo /Gm- /GR- /EHa- /EHsc /Ox
set WARNING_FLAGS=/WX /W4 /wd4702 /wd4505

pushd build

cl %DEFINES% %FLAGS% %WARNING_FLAGS% /Feprofit_paths.exe ..\src-cpp\profit_paths.cpp

popd build