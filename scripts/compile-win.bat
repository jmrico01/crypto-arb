@echo off

where cl
if %ERRORLEVEL% NEQ 0 call "C:\Program Files (x86)\Microsoft Visual Studio 14.0\VC\vcvarsall.bat" x64

pushd build

cl /D_CRT_SECURE_NO_WARNINGS /nologo /Gm- /GR- /EHa- /EHsc /WX /W4 /FeprofitPaths.exe ..\src-cpp\profitPaths.cpp

popd build