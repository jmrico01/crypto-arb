#include <stdlib.h>
#include <stdio.h>
#include <string.h>

#include <vector>
#include <queue>
#include <algorithm>

#define NODE_NAME_MAX_LEN 32
#define LINK_BUF_LEN 128
#define LINK_FIELDS 3

typedef unsigned int uint;

struct Link {
    float frac;
    float flat;
    float time; // ?
};

struct Path {
    Link profit;
    std::vector<int> path;
};

bool PathContainsNode(const std::vector<int>& path, int node)
{
    for (int i = 0; i < path.size(); i++) {
        if (path[i] == node) {
            return true;
        }
    }

    return false;
}

Link AddLinkProfit(Link p1, Link p2)
{
    return {
        p1.frac * p2.frac,
        p1.flat * p2.frac + p2.flat,
        p1.time + p2.time
    };
}

Link CalcPathProfit(const std::vector<int>& path, Link** links)
{
    Link profit = { 1.0, 0.00, 0.0 };
    for (int i = 1; i < path.size(); i++) {
        Link link = links[path[i-1]][path[i]];
        profit.frac *= link.frac;
        profit.flat = profit.flat * link.frac + link.flat;
        profit.time += link.time;
    }

    return profit;
}

bool ComparePaths(const Path& p1, const Path& p2)
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

void CalcMaxProfitPaths(
    int numNodes, int src, int dst, Link** links,
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
            profitPaths.push_back({ profit, paths[pathID] });
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
                newPathID = paths.size();
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

bool ParseLink(char* buf, Link* link)
{
    char* fields[LINK_FIELDS];
    fields[0] = buf;
    int field = 1;
    for (int i = 0; i < LINK_BUF_LEN; i++) {
        if (buf[i] == ',') {
            if (field >= LINK_FIELDS) {
                fprintf(stderr, "Too many link fields");
                return false;
            }

            buf[i] = 0;
            fields[field++] = &buf[i+1];
        }
    }
    if (field != LINK_FIELDS) {
        fprintf(stderr, "Not enough link fields");
        return false;
    }

    for (int i = 0; i < LINK_FIELDS; i++) {
        char* e;
        float field = (float)strtod(fields[i], &e);
        if (*e != '\0') {
            fprintf(stderr, "Field strtod parse failed");
            return false;
        }

        if (i == 0) {
            link->frac = field;
        }
        else if (i == 1) {
            link->flat = field;
        }
        else if (i == 2) {
            link->time = field;
        }
    }

    return true;
}

void Cleanup(FILE* file, int numNodes, char** nodes, Link** links)
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
        fprintf(stderr, "Expected 3 arguments: inFile, outFile, numPaths");
        return 1;
    }
    char* e;
    int numPaths = (int)strtol(argv[3], &e, 10);
    if (*e != '\0') {
        fprintf(stderr, "Invalid numPaths argument");
        return false;
    }

    FILE* file = fopen(argv[1], "r");
    if (!file) {
        fprintf(stderr, "Couldn't open input file: %s", argv[1]);
        return 1;
    }
    int c = fgetc(file);
    if (c == '\n') {
        fprintf(stderr, "Unexpected double new line");
        Cleanup(file, 0, 0, 0);
        return 1;
    }
    uint numNodes = 0;

    // Read number of nodes
    while (c != '\n') {
        if (c < 0x30 || c > 0x39) {
            fprintf(stderr, "Expected number of nodes in first line");
            Cleanup(file, 0, 0, 0);
            return 1;
        }
        numNodes = numNodes * 10 + c - 0x30;

        c = fgetc(file);
    }

    // Allocate memory for node names
    // TODO make contiguous?
    //printf("Nodes: %d\n", numNodes);
    char** nodes = (char**)malloc(numNodes * sizeof(char*));
    for (int i = 0; i < numNodes; i++) {
        nodes[i] = (char*)malloc(NODE_NAME_MAX_LEN);
    }
    int startNode = -1;
    int endNode = -1;

    int node = 0;
    int nodeCh = 0;
    c = fgetc(file);
    if (c == '\n') {
        fprintf(stderr, "Unexpected double new line");
        Cleanup(file, numNodes, nodes, 0);
        return 1;
    }
    // Read node names
    while (true) {
        if (c == ',' || c == '\n') {
            if (nodeCh == 0) {
                fprintf(stderr, "Empty node name");
                Cleanup(file, numNodes, nodes, 0);
                return 1;
            }
            nodes[node][nodeCh] = 0;
            if (strcmp(nodes[node], "start") == 0) {
                startNode = node;
            }
            if (strcmp(nodes[node], "end") == 0) {
                endNode = node;
            }
            if (c == '\n') {
                break;
            }

            nodeCh = 0;
            node++;
            c = fgetc(file);
            if (c == '\n') {
                fprintf(stderr, "Unexpected double new line");
                Cleanup(file, numNodes, nodes, 0);
                return 1;
            }
        }

        nodes[node][nodeCh++] = (char)c;
        c = fgetc(file);
    }
    if (startNode == -1 || endNode == -1) {
        fprintf(stderr, "Start or end node not found");
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

    int node1 = 0;
    int node2 = 0;
    char linkBuf[LINK_BUF_LEN];
    c = fgetc(file);
    if (c == EOF) {
        fprintf(stderr, "End of file before links");
        Cleanup(file, numNodes, nodes, links);
        return 1;
    }
    // Read node names
    while (c != EOF) {
        if (c == ',') {
            node2++;
        }
        else if (c == '\n') {
            node2 = 0;
            node1++;
        }
        else if (c == '[') {
            c = fgetc(file);
            if (c == ']') {
                fprintf(stderr, "Empty link, []");
                Cleanup(file, numNodes, nodes, links);
                return 1;
            }
            int bufInd = 0;
            while (c != ']') {
                linkBuf[bufInd++] = c;
                c = fgetc(file);
            }
            linkBuf[bufInd] = 0;

            //printf("linkBuf: %s\n", linkBuf);
            if (!ParseLink(linkBuf, &links[node1][node2])) {
                fprintf(stderr, "ParseLink failed: (%s, %s)",
                    nodes[node1], nodes[node2]);
                Cleanup(file, numNodes, nodes, links);
                return 1;
            }

            /*printf("link ( %s, %s )\n", nodes[node1], nodes[node2]);
            printf("%f, %f, %f\n",
                links[node1][node2].frac,
                links[node1][node2].flat,
                links[node1][node2].time);*/
        }
        else {
            fprintf(stderr, "Unexpected char %d\n" + c);
            Cleanup(file, numNodes, nodes, links);
            return 1;
        }

        c = fgetc(file);
    }

    fclose(file);

    std::vector<Path> profitPaths;
    CalcMaxProfitPaths(numNodes, startNode, endNode, links, profitPaths);

    FILE* outFile = fopen(argv[2], "w");
    if (!outFile) {
        fprintf(stderr, "Couldn't open out file: %s", argv[2]);
        Cleanup(0, numNodes, nodes, links);
        return 1;
    }
    int k = profitPaths.size() < numPaths ? profitPaths.size() : numPaths;
    fprintf(outFile, "[\n");
    for (int i = 0; i < k; i++) {
        fprintf(outFile, "    [ [%f, %f, %f], [",
            profitPaths[i].profit.frac,
            profitPaths[i].profit.flat,
            profitPaths[i].profit.time);
        for (int j = 0; j < profitPaths[i].path.size(); j++) {
            fprintf(outFile, "\"%s\"", nodes[profitPaths[i].path[j]]);
            if (j != profitPaths[i].path.size() - 1) {
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
    fclose(outFile);

    Cleanup(0, numNodes, nodes, links);

    //printf("Done\n");
    return 0;
}