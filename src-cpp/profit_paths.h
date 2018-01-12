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

void RecordCycle(
    const Link** links, int* path, int pathLen,
    std::vector<Path>& cycles);