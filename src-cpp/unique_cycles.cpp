#include "unique_cycles.h"

#include <stdlib.h>

static bool TarjanBacktrack(
    int numNodes, const Link** links, int** neighbors,
    int* path, bool* marked, int* markedStack,
    int* kPath, int* kMarked,
    int v,
    std::vector<Path>& cycles)
{
    bool f = false;
    path[*kPath] = v;
    *kPath += 1;
    markedStack[*kMarked] = v;
    *kMarked += 1;
    marked[v] = true;

    int count = 0;
    while (neighbors[v][count] != -1) {
        int w = neighbors[v][count++];
        /*if (w == -2) {
            continue;
        }*/

        if (w < path[0]) {
            // delete w from neighbors[v]
            // TODO unclear whether this is helpful
            //neighbors[v][count - 1] = -2;
        }
        else if (w == path[0]) {
            RecordCycle(links, path, *kPath, cycles);
            f = true;
        }
        else if (!marked[w]) {
            f = TarjanBacktrack(numNodes, links, neighbors,
                path, marked, markedStack, kPath, kMarked,
                w, cycles) || f;
        }
    }

    if (f) {
        while (markedStack[(*kMarked) - 1] != v) {
            int u = markedStack[(*kMarked) - 1];
            *kMarked -= 1;
            marked[u] = false;
        }
        *kMarked -= 1;
        marked[v] = false;
    }

    *kPath -= 1;
    return f;
}

/**
 * Implementation of Tarjan's algorithm for finding elementary circuits.
 * "Enumeration of the Elementary Circuits of a Directed Graph"
 * Tarjan, Robert Endre. Cornell University (1972).
 * https://ecommons.cornell.edu/handle/1813/5941
 */
void FindUniqueCyclesTarjan(
    int numNodes, const Link** links, int** neighbors,
    std::vector<Path>& cycles)
{
    int* path = (int*)malloc(numNodes * sizeof(int));
    int kPath = 0;
    int* markedStack = (int*)malloc(numNodes * sizeof(int));
    int kMarked = 0;
    bool* marked = (bool*)malloc(numNodes * sizeof(bool));
    for (int i = 0; i < numNodes; i++) {
        marked[i] = false;
    }

    for (int s = 0; s < numNodes; s++) {
        TarjanBacktrack(numNodes, links, neighbors,
            path, marked, markedStack, &kPath, &kMarked,
            s, cycles);
        while (kMarked > 0) {
            int u = markedStack[--kMarked];
            marked[u] = false;
        }
    }

    free(marked);
    free(markedStack);
    free(path);
}

/**
 * Implementation of Tiernan's algorithm for finding elementary circuits.
 * "An Efficient Search Algorithm to Find the Elementary Circuits of a Graph"
 * Tiernan, James C. University of California, San Diego (1970).
 * http://citeseerx.ist.psu.edu/viewadoc/download?doi=10.1.1.516.9454&rep=rep1&type=pdf
 */
void FindUniqueCyclesTiernan(
    int numNodes, const Link** links, int** neighbors,
    std::vector<Path>& cycles)
{
    int* path = (int*)malloc(numNodes * sizeof(int));
    bool** closed = (bool**)malloc(numNodes * sizeof(bool*));
    for (int i = 0; i < numNodes; i++) {
        closed[i] = (bool*)malloc(numNodes * sizeof(bool));
        for (int j = 0; j < numNodes; j++) {
            closed[i][j] = false;
        }
    }
    int k = 0;
    path[k] = 0;

    while (true) {
        // Path extension
        while (true) {
            /*printf("path extension step\npath: ");
            for (int i = 0; i <= k; i++) {
                printf("%d, ", path[i]);
            }
            printf("\n");*/
            bool foundNext = false;
            //for (int i = 0; i < numNodes; i++) {
            int count = 0;
            while (neighbors[path[k]][count] != -1) {
                int n = neighbors[path[k]][count++];

                if (n <= path[0]) {
                    continue;
                }
                if (closed[path[k]][n]) {
                    continue;
                }
                bool inPath = false;
                for (int i = 0; i <= k; i++) {
                    if (path[i] == n) {
                        inPath = true;
                        break;
                    }
                }
                if (inPath) {
                    continue;
                }

                foundNext = true;
                path[++k] = n;
                break;
            }
            if (!foundNext) {
                //printf("=> NO NEXT NODE\n");
                break;
            }
        }

        // Circuit confirmation
        if (links[path[k]][path[0]].frac != 0.0) {
            RecordCycle(links, path, k + 1, cycles);
        }

        // Vertex closure
        if (k != 0) {
            //printf("<= backtracking path\n");
            for (int i = 0; i < numNodes; i++) {
                closed[path[k]][i] = false;
            }
            closed[path[k-1]][path[k]] = true;
            path[k--] = 0;
        }
        else {
            // Advance initial vertex
            if (path[0] == numNodes - 1) {
                // Done
                //printf("Done\n");
                break;
            }

            path[0]++;
            k = 0;
            for (int i = 0; i < numNodes; i++) {
                for (int j = 0; j < numNodes; j++) {
                    closed[i][j] = false;
                }
            }
        }
    }

    for (int i = 0; i < numNodes; i++) {
        free(closed[i]);
    }
    free(closed);
    free(path);
}