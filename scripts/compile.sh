#!/bin/bash

# Must be run from the main project directory.

set GCC_FLAGS="-std=c++11"
set GCC_WARNING_FLAGS="-Wall"

g++ $GCC_FLAGS $GCC_WARNING_FLAGS -o build/profitPaths src-cpp/profitPaths.cpp