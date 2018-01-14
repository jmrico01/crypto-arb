#include "profit_paths.h"

#include <stdlib.h>
#include <stdio.h>
#include <string.h>

#include <vector>
#include <queue>
#include <set>
#include <algorithm>

#include <chrono>

#include "unique_cycles.h"

#define LINE_BUF_LEN 4096
#define NODE_NAME_MAX_LEN 32
#define LINK_BUF_LEN 128
#define LINK_FIELDS 3

typedef unsigned int uint;

std::vector<double> timeStart(10, 0.0);
static double Time(int id)
{
    auto nowDur = std::chrono::system_clock::now().time_since_epoch();
    double now = std::chrono::duration_cast<std::chrono::duration<double>>
        (nowDur).count();
    if (timeStart[id] == 0.0f) {
        timeStart[id] = now;
    }
    else {
        double delta = now - timeStart[id];
        timeStart[id] = 0.0;
        return delta;
    }

    return 0.0f;
}

static Link CalcPathProfit(const std::vector<int>& path, const Link** links)
{
    Link profit = { 1.0, 0.00, 0.0 };
    for (int i = 1; i < (int)path.size(); i++) {
        Link link = links[path[i-1]][path[i]];
        profit.frac *= link.frac;
        profit.flat = profit.flat * link.frac + link.flat;
        profit.time += link.time;
    }

    return profit;
}

static bool ComparePaths(const Path& p1, const Path& p2)
{
    if (p1.profit.frac != p2.profit.frac) {
        return p1.profit.frac > p2.profit.frac;
    }
    else {
        if (p1.profit.flat != p2.profit.flat) {
            return p1.profit.flat < p2.profit.flat;
        }
        else {
            return p1.profit.time < p2.profit.time;
        }
    }
}

static bool PathContainsNode(const std::vector<int>& path, int node)
{
    for (int i = 0; i < (int)path.size(); i++) {
        if (path[i] == node) {
            return true;
        }
    }

    return false;
}

/*static void FindProfitPaths(
    int numNodes, const Link** links,
    int src, int dst,
    std::vector<Path>& paths)
{
}*/

// VERY inefficient
static void FindProfitPaths(
    int numNodes, int src, int dst, const Link** links,
    std::vector<Path>& profitPaths)
{
    int depthMarker = -1;
    int maxDepth = numNodes - 1;
    std::vector<std::vector<int>> paths;
    int freeID = -1;
    paths.push_back({ src });

    std::queue<int> toVisit;
    std::queue<int> pathIDs;
    int depth = 0;

    toVisit.push(src);
    pathIDs.push(0);
    toVisit.push(depthMarker);
    while (depth < maxDepth) {
        int node = toVisit.front();
        toVisit.pop();
        if (node == depthMarker) {
            depth++;
            toVisit.push(depthMarker);
            /*if (depth % 5 == 0) {
                printf("===== depth: %d =====\n", depth);
            }*/
            continue;
        }
        int pathID = pathIDs.front();
        pathIDs.pop();

        if (node == dst) {
            // At this point, paths are implicitly sorted
            // by their length, which might be useful for something.
            Link profit = CalcPathProfit(paths[pathID], links);
            if (profit.frac > 1.0f) {
                profitPaths.push_back({ profit, paths[pathID] });
            }
            continue;
        }

        for (int i = 0; i < numNodes; i++) {
            if (links[node][i].frac == 0.0) {
                continue;
            }
            if (PathContainsNode(paths[pathID], i)) {
                // Node already in path, will create a cycle
                continue;
            }

            std::vector<int> newPath = paths[pathID];
            newPath.push_back(i);
            int newPathID = freeID;
            if (newPathID == -1) {
                newPathID = (int)paths.size();
                paths.push_back(newPath);
            }
            else {
                paths[newPathID] = newPath;
                freeID = -1;
            }

            toVisit.push(i);
            pathIDs.push(newPathID);
        }
        freeID = pathID;
    }

    std::sort(profitPaths.begin(), profitPaths.end(), ComparePaths);
    //printf("paths: %d\nfinal: %d\n", paths.size(), profitPaths.size());
}

static Link CalcCycleProfit(const Link** links, int* path, int pathLen)
{
    Link profit = { 1.0, 0.00, 0.0 };
    for (int i = 1; i < pathLen; i++) {
        Link link = links[path[i-1]][path[i]];
        profit.frac *= link.frac;
        profit.flat = profit.flat * link.frac + link.flat;
        profit.time += link.time;
    }

    Link link = links[path[pathLen-1]][path[0]];
    profit.frac *= link.frac;
    profit.flat = profit.flat * link.frac + link.flat;
    profit.time += link.time;

    return profit;
}

int totalCycles = 0;
void RecordCycle(
    const Link** links, int* path, int pathLen,
    std::vector<Path>& cycles)
{
    Link profit = CalcCycleProfit(links, path, pathLen);
    // TODO only writing immediate cycles for now
    if (profit.frac > 1.0 && profit.time == 0.0) {
        std::vector<int> cycle(pathLen);
        for (int i = 0; i < pathLen; i++) {
            cycle[i] = path[i];
        }
        cycles.push_back({ profit, cycle });
    }
    totalCycles++;
}

static void FindProfitCycles(
    int numNodes, const Link** links,
    std::vector<Path>& cycles)
{
    // Alternate representation of links
    int** neighbors = (int**)malloc(numNodes * sizeof(int*));
    for (int i = 0; i < numNodes; i++) {
        neighbors[i] = (int*)malloc(numNodes * sizeof(int));
        for (int j = 0; j < numNodes; j++) {
            neighbors[i][j] = -1;
        }

        int count = 0;
        for (int j = 0; j < numNodes; j++) {
            if (links[i][j].frac != 0.0) {
                neighbors[i][count++] = j;
            }
        }
    }

    FindUniqueCyclesTarjan(numNodes, links, neighbors, cycles);
    //FindUniqueCyclesTiernan(numNodes, links, neighbors, cycles);

    std::sort(cycles.begin(), cycles.end(), ComparePaths);

    /*for (int i = 0; i < (int)cycles.size(); i++) {
        if (cycles[i].profit.time == 0.0) {
            printf("OMG INSTANT PROFIT!\n");
        }
    }*/

    for (int i = 0; i < numNodes; i++) {
        free(neighbors[i]);
    }
    free(neighbors);
}

static void WritePaths(
    FILE* outFile, char** nodes,
    const std::vector<Path>& paths, int k)
{
    fprintf(outFile, "[\n");
    for (int i = 0; i < k; i++) {
        fprintf(outFile, "    [ [%f, %f, %f], [",
            paths[i].profit.frac,
            paths[i].profit.flat,
            paths[i].profit.time);
        for (int j = 0; j < (int)paths[i].path.size(); j++) {
            fprintf(outFile, "\"%s\"", nodes[paths[i].path[j]]);
            if (j != (int)paths[i].path.size() - 1) {
                fprintf(outFile, ", ");
            }
        }
        fprintf(outFile, "] ]");
        if (i != k - 1) {
            fprintf(outFile, ",");
        }
        fprintf(outFile, "\n");
    }
    fprintf(outFile, "]");
}

static bool ReadLine(FILE* file, char* buf, int bufSize)
{
    int i = 0;
    int c = fgetc(file);
    while (c != '\r' && c != '\n' && c != EOF) {
        if (i >= bufSize - 1) {
            printf("WARNING: line length exceeded buffer\n");
            i = bufSize - 1;
        }
        else {
            buf[i++] = (char)c;
        }
        c = fgetc(file);
    }
    if (c == '\r') {
        c = fgetc(file);
        if (c != '\n') {
            printf("WARNING: CR not followed by LF\n");
            ungetc(c, file);
        }
    }
    if (c == EOF) {
        if (i == 0) {
            return false;
        }
        else {
            ungetc(c, file);
        }
    }

    buf[i] = '\0';
    return true;
}

static bool ParseNodeNames(char** nodes, int numNodes, char* str)
{
    int node = 0;
    int i = 0;
    int iNode = 0;
    while (true) {
        if (str[i] == ',' || str[i] == '\0') {
            nodes[node++][iNode] = '\0';
            if (str[i] == '\0') {
                break;
            }
            i++;
            iNode = 0;
        }
        else {
            nodes[node][iNode++] = str[i++];
        }
    }

    if (node != numNodes) {
        fprintf(stderr, "numNodes != number of parsed nodes");
        return false;
    }

    return true;
}

static bool ParseLink(char* buf, Link* link)
{
    char* fields[LINK_FIELDS];
    fields[0] = buf;
    int field = 1;
    for (int i = 0; i < LINK_BUF_LEN; i++) {
        if (buf[i] == ',') {
            if (field >= LINK_FIELDS) {
                fprintf(stderr, "Too many link fields\n");
                return false;
            }

            buf[i] = '\0';
            fields[field++] = &buf[i+1];
        }
        else if (buf[i] == '\0') {
            break;
        }
    }
    if (field != LINK_FIELDS) {
        fprintf(stderr, "Not enough link fields (%d)\n", field);
        return false;
    }

    for (int i = 0; i < LINK_FIELDS; i++) {
        char* e;
        float fieldVal = (float)strtod(fields[i], &e);
        if (*e != '\0') {
            fprintf(stderr, "Field strtod parse failed\n");
            return false;
        }

        if (i == 0) {
            link->frac = fieldVal;
        }
        else if (i == 1) {
            link->flat = fieldVal;
        }
        else if (i == 2) {
            link->time = fieldVal;
        }
    }

    return true;
}

static bool ParseLinks(Link** links, int numNodes, FILE* file, char* buf)
{
    char linkBuf[LINK_BUF_LEN];

    for (int i = 0; i < numNodes; i++) {
        if (!ReadLine(file, buf, LINE_BUF_LEN)) {
            fprintf(stderr, "Graph data incomplete");
            return false;
        }

        int link = 0;
        int iBuf = 0;
        while (true) {
            if (buf[iBuf] == '[') {
                iBuf++;
                int iLink = 0;
                while (buf[iBuf] != ']') {
                    linkBuf[iLink++] = buf[iBuf++];
                }
                linkBuf[iLink] = '\0';
                if (!ParseLink(linkBuf, &links[i][link])) {
                    fprintf(stderr, "ParseLink failed (%d, node %d)", link, i);
                    return false;
                }
            }
            else if (buf[iBuf] == ',' || buf[iBuf] == '\0') {
                link++;
                if (buf[iBuf] == '\0') {
                    break;
                }
            }

            iBuf++;
        }

        if (link != numNodes) {
            fprintf(stderr, "numNodes != links for node %d", i);
            return false;
        }
    }

    return true;
}

static void Cleanup(FILE* file, int numNodes, char** nodes, Link** links)
{
    if (links) {
        for (int i = 0; i < numNodes; i++) {
            free(links[i]);
        }
        free(links);
    }
    if (nodes) {
        for (int i = 0; i < numNodes; i++) {
            free(nodes[i]);
        }
        free(nodes);
    }

    if (file) {
        fclose(file);
    }
}

int main(int argc, char* argv[])
{
    if (argc != 4) {
        fprintf(stderr, "Expected 3 arguments: %s",
            "inFile, pathsFile, cyclesFile");
        return 1;
    }

    //printf("reading graph\n");
    FILE* file = fopen(argv[1], "r");
    if (!file) {
        fprintf(stderr, "Couldn't open input file: %s", argv[1]);
        return 1;
    }

    char buf[LINE_BUF_LEN];

    // Read number of nodes
    if (!ReadLine(file, buf, LINE_BUF_LEN)) {
        fprintf(stderr, "Graph data incomplete");
        Cleanup(file, 0, 0, 0);
        return 0;
    }
    char* e;
    int numNodes = (int)strtol(buf, &e, 10);
    if (*e != '\0') {
        fprintf(stderr, "Invalid number of nodes");
        return 0;
    }

    // Allocate memory for node names
    // TODO make contiguous?
    //printf("Nodes: %d\n", numNodes);
    char** nodes = (char**)malloc(numNodes * sizeof(char*));
    for (int i = 0; i < numNodes; i++) {
        nodes[i] = (char*)malloc(NODE_NAME_MAX_LEN * sizeof(char));
    }

    // Read node names
    if (!ReadLine(file, buf, LINE_BUF_LEN)) {
        fprintf(stderr, "Graph data incomplete");
        Cleanup(file, numNodes, nodes, 0);
        return 0;
    }
    if (!ParseNodeNames(nodes, numNodes, buf)) {
        Cleanup(file, numNodes, nodes, 0);
        return 1;
    }

    // Allocate memory for links
    // TODO make contiguous?
    Link** links = (Link**)malloc(numNodes * sizeof(Link*));
    for (int i = 0; i < numNodes; i++) {
        links[i] = (Link*)malloc(numNodes * sizeof(Link));
        for (int j = 0; j < numNodes; j++) {
            links[i][j] = { 0.0, 0.00, 0.0 };
        }
    }

    // Read links
    if (!ParseLinks(links, numNodes, file, buf)) {
        Cleanup(file, numNodes, nodes, links);
        return 0;
    }

    fclose(file);

    // Print graph (debug)
    /*for (int i = 0; i < numNodes; i++) {
        printf("%s\n", nodes[i]);
        for (int j = 0; j < numNodes; j++) {
            if (links[i][j].frac != 0.0) {
                printf("  %s : %f, %f, %f\n", nodes[j],
                    links[i][j].frac, links[i][j].flat, links[i][j].time);
            }
        }
    }*/

    //printf("starting path computations\n");
    //fflush(stdout);

    //Time(0);
    std::vector<Path> profitPaths;
    //FindProfitPaths(numNodes, numNodes-2, numNodes-1, (const Link**)links, profitPaths);
    //printf("  paths time: %f\n", Time(0));
    //fflush(stdout);

    Time(0);
    std::vector<Path> profitCycles;
    FindProfitCycles(numNodes, (const Link**)links, profitCycles);
    //printf("  cycles time: %f\n", Time(0));
    //fflush(stdout);

    // Write profit paths
    FILE* outFile = fopen(argv[2], "w");
    if (!outFile) {
        fprintf(stderr, "Couldn't open paths out file: %s", argv[2]);
        Cleanup(0, numNodes, nodes, links);
        return 1;
    }
    WritePaths(outFile, nodes, profitPaths, (int)profitPaths.size());
    fclose(outFile);

    // Write profit cycles
    outFile = fopen(argv[3], "w");
    if (!outFile) {
        fprintf(stderr, "Couldn't open cycles out file: %s", argv[3]);
        Cleanup(0, numNodes, nodes, links);
        return 1;
    }
    WritePaths(outFile, nodes, profitCycles, (int)profitCycles.size());
    fclose(outFile);

    Cleanup(0, numNodes, nodes, links);

    //printf("done\n");
    return 0;
}

#include "unique_cycles.cpp"