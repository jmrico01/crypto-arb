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

enum ReadMode {
    READMODE_NORMAL,
    READMODE_STRUCTURE
};

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
        if (link.frac == 0.0) {
            return { 0.0, 0.00, 0.0 };
        }
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
        if (link.frac == 0.0) {
            return { 0.0, 0.00, 0.0 };
        }
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

void RecordAnyCycle(
    const char** nodes, const Link** links,
    int* path, int pathLen,
    FILE* outFile, std::vector<std::vector<int>>& cycles)
{
    static bool first = true;

    if (first) {
        first = false;
    }
    else {
        fprintf(outFile, ",\n");
    }
    fprintf(outFile, "    [ ");
    for (int i = 0; i < pathLen; i++) {
        fprintf(outFile, "\"%s\"", nodes[path[i]]);
        if (i != pathLen - 1) {
            fprintf(outFile, ", ");
        }
    }
    fprintf(outFile, " ]");
}

static void FindProfitCycles(
    int numNodes, const char** nodes, const Link** links,
    FILE* outFile, std::vector<std::vector<int>>& cycles,
    RecordCycleFunc recordCycleFunc)
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

    FindUniqueCyclesTarjan(numNodes, nodes, links, neighbors,
        outFile, cycles, recordCycleFunc);
    /*FindUniqueCyclesTiernan(numNodes, links, neighbors,
        cycles, recordCycleFunc);*/

    //std::sort(cycles.begin(), cycles.end(), ComparePaths);

    for (int i = 0; i < numNodes; i++) {
        free(neighbors[i]);
    }
    free(neighbors);
}

static void WritePaths(
    FILE* outFile, char** nodes,
    const std::vector<std::vector<int>>& paths, int k)
{
    fprintf(outFile, "[\n");
    for (int i = 0; i < k; i++) {
        fprintf(outFile, "    [ ");
        for (int j = 0; j < (int)paths[i].size(); j++) {
            fprintf(outFile, "\"%s\"", nodes[paths[i][j]]);
            if (j != (int)paths[i].size() - 1) {
                fprintf(outFile, ", ");
            }
        }
        fprintf(outFile, " ]");
        if (i != k - 1) {
            fprintf(outFile, ",");
        }
        fprintf(outFile, "\n");
    }
    fprintf(outFile, "]");
}
static void WriteProfitPaths(
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

static bool ParseNames(char** names, int n, char* str)
{
    int name = 0;
    int i = 0;
    int iName = 0;
    while (true) {
        if (str[i] == ',' || str[i] == '\0') {
            names[name++][iName] = '\0';
            if (str[i] == '\0') {
                break;
            }
            if (name >= n) {
                fprintf(stderr, "number of names != number of parsed names\n");
                return false;
            }
            i++;
            iName = 0;
        }
        else {
            names[name][iName++] = str[i++];
        }
    }

    if (name != n) {
        fprintf(stderr, "number of names != number of parsed names\n");
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

static bool ParseLinks(Link** links, int numNodes,
    FILE* file, char* buf, ReadMode readMode)
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
                if (readMode == READMODE_STRUCTURE) {
                    links[i][link].frac = 1.0f;
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

static void Cleanup(
    FILE* file,
    int numSites, char** sites,
    int numNodes, char** nodes,
    Link** links)
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
    if (sites) {
        for (int i = 0; i < numSites; i++) {
            free(sites[i]);
        }
        free(sites);
    }

    if (file) {
        fclose(file);
    }
}

int main(int argc, char* argv[])
{
    if (argc != 5) {
        fprintf(stderr, "Expected 4 arguments: %s",
            "inFile, pathsFile, cyclesFile, mode (instant_cycles/...)");
        return 1;
    }

    ReadMode readMode = READMODE_NORMAL;
    if (strncmp(argv[4], "instant_cycles", 64) == 0) {
        readMode = READMODE_STRUCTURE;
    }

    //printf("reading graph\n");
    FILE* file = fopen(argv[1], "r");
    if (!file) {
        fprintf(stderr, "Couldn't open input file: %s", argv[1]);
        return 1;
    }

    char buf[LINE_BUF_LEN];
    char* e;

    // Read number of nodes
    if (!ReadLine(file, buf, LINE_BUF_LEN)) {
        fprintf(stderr, "Graph data incomplete");
        Cleanup(file, 0, 0, 0, 0, 0);
        return 0;
    }
    int numSites = (int)strtol(buf, &e, 10);
    if (*e != '\0') {
        fprintf(stderr, "Invalid number of sites");
        return 0;
    }

    // Allocate memory for site names
    // TODO make contiguous?
    //printf("Sites: %d\n", numSites);
    char** sites = (char**)malloc(numSites * sizeof(char*));
    for (int i = 0; i < numSites; i++) {
        sites[i] = (char*)malloc(NODE_NAME_MAX_LEN * sizeof(char));
    }

    // Read site names
    if (!ReadLine(file, buf, LINE_BUF_LEN)) {
        fprintf(stderr, "Graph data incomplete");
        Cleanup(file, numSites, sites, 0, 0, 0);
        return 0;
    }
    if (!ParseNames(sites, numSites, buf)) {
        fprintf(stderr, "Failed to parse site names");
        Cleanup(file, numSites, sites, 0, 0, 0);
        return 1;
    }

    // Read number of nodes
    if (!ReadLine(file, buf, LINE_BUF_LEN)) {
        fprintf(stderr, "Graph data incomplete");
        Cleanup(file, numSites, sites, 0, 0, 0);
        return 0;
    }
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
        Cleanup(file, numSites, sites, numNodes, nodes, 0);
        return 0;
    }
    if (!ParseNames(nodes, numNodes, buf)) {
        fprintf(stderr, "Failed to parse node names");
        Cleanup(file, numSites, sites, numNodes, nodes, 0);
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
    if (!ParseLinks(links, numNodes, file, buf, readMode)) {
        Cleanup(file, numSites, sites, numNodes, nodes, links);
        return 0;
    }

    fclose(file);

    // Print graph (debug)
    /*printf("Sites: ");
    for (int i = 0; i < numSites; i++) {
        printf("%s, ", sites[i]);
    }
    int numLinks = 0;
    printf("\n");
    for (int i = 0; i < numNodes; i++) {
        printf("%s\n", nodes[i]);
        for (int j = 0; j < numNodes; j++) {
            if (links[i][j].frac != 0.0) {
                numLinks++;
                printf("  %s : %f, %f, %f\n", nodes[j],
                    links[i][j].frac, links[i][j].flat, links[i][j].time);
            }
        }
    }
    printf("Total nodes: %d\n", numNodes);
    printf("Total links: %d\n", numLinks);
    fflush(stdout);*/

    //printf("starting path computations\n");
    //fflush(stdout);

    //Time(0);
    std::vector<Path> profitPaths;
    //FindProfitPaths(numNodes, numNodes-2, numNodes-1, (const Link**)links, profitPaths);
    //printf("  paths time: %f\n", Time(0));
    //fflush(stdout);

    std::vector<std::vector<int>> cycles;
    if (strncmp(argv[4], "instant_cycles", 64) == 0) {
        //printf("Instant cycles mode\n");
        for (int i = 0; i < numNodes; i++) {
            for (int j = 0; j < numNodes; j++) {
                if (links[i][j].time != 0.0) {
                    links[i][j] = { 0.0, 0.00, 0.0 };
                }
            }
        }

        FILE* outFile = fopen(argv[3], "w");
        if (!outFile) {
            fprintf(stderr, "Couldn't open cycles out file: %s", argv[3]);
            Cleanup(0, numSites, sites, numNodes, nodes, links);
            return 1;
        }
        fprintf(outFile, "[\n");
        Time(0);
        FindProfitCycles(numNodes, (const char**)nodes, (const Link**)links,
            outFile, cycles, RecordAnyCycle);
        printf("  cycles time: %f\n", Time(0));
        fflush(stdout);
        fprintf(outFile, "\n]\n");
        fclose(outFile);
    }
    else {
        fprintf(stderr, "Invalid operation mode");
        return 1;
    }

    //Time(0);
    //printf("  cycles time: %f\n", Time(0));
    //fflush(stdout);

    // Write profit paths
    FILE* outFile = fopen(argv[2], "w");
    if (!outFile) {
        fprintf(stderr, "Couldn't open paths out file: %s", argv[2]);
        Cleanup(0, numSites, sites, numNodes, nodes, links);
        return 1;
    }
    WriteProfitPaths(outFile, nodes, profitPaths, (int)profitPaths.size());
    fclose(outFile);

    // Write profit cycles
    /*outFile = fopen(argv[3], "w");
    if (!outFile) {
        fprintf(stderr, "Couldn't open cycles out file: %s", argv[3]);
        Cleanup(0, numSites, sites, numNodes, nodes, links);
        return 1;
    }
    WritePaths(outFile, nodes, cycles, (int)cycles.size());
    fclose(outFile);*/

    Cleanup(0, numSites, sites, numNodes, nodes, links);

    //printf("done\n");
    return 0;
}

#include "unique_cycles.cpp"