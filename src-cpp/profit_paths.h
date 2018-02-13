#pragma once

#include <vector>

struct Link {
    float frac;
    float flat;
    float time; // ?
};

struct Path {
    Link profit;
    std::vector<int> path;
};

typedef void (*RecordCycleFunc)(
    const char** nodes, const Link** links,
    int* path, int pathLen,
    FILE* outFile, std::vector<std::vector<int>>& cycles);