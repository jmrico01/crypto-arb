#pragma once

#include <stdlib.h>

#include <vector>

#include "profit_paths.h"

void FindUniqueCyclesTarjan(
    int numNodes, const Link** links, int** neighbors,
    std::vector<Path>& cycles);

void FindUniqueCyclesTiernan(
    int numNodes, const Link** links, int** neighbors,
    std::vector<Path>& cycles);