#pragma once

#include <stdlib.h>

#include <vector>

#include "profit_paths.h"

void FindUniqueCyclesTarjan(
    int numNodes, const char** nodes, const Link** links, int** neighbors,
    FILE* outFile, std::vector<std::vector<int>>& cycles,
    RecordCycleFunc recordCycleFunc);

void FindUniqueCyclesTiernan(
    int numNodes, const char** nodes, const Link** links, int** neighbors,
    FILE* outFile, std::vector<std::vector<int>>& cycles,
    RecordCycleFunc recordCycleFunc);