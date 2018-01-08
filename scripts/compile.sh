#!/bin/bash

# Must be run from the main project directory.

GCC_FLAGS="-std=c++11"
GCC_WARNING_FLAGS="-Wall"

g++ $GCC_FLAGS $GCC_WARNING_FLAGS -o build/profitPaths src-cpp/profitPaths.cpp