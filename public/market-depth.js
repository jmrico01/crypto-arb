function ClearPlot()
{
    d3.select("#depthPlot").remove();
}

function Plot(datasets, xMin, xMax)
{
    /*var xMin = 100000000000.0;
    for (var i = 0; i < datasets.length; i++) {
        var localMin = d3.min(datasets[i], function(d) { return d[0] });
        if (xMin > localMin) {
            xMin = localMin;
        }
    }
    var xMax = 0.0;
    for (var i = 0; i < datasets.length; i++) {
        var localMax = d3.max(datasets[i], function(d) { return d[0] });
        if (xMax < localMax) {
            xMax = localMax;
        }
    }*/
    var yMax = 0.0;
    for (var i = 0; i < datasets.length; i++) {
        var localMax = d3.max(datasets[i], function(d) { return d[1] });
        if (yMax < localMax) {
            yMax = localMax;
        }
    }

    var margin = {top: 20, right: 60, bottom: 20, left: 60};
    var width = 900 - margin.left - margin.right;
    var height = 400 - margin.top - margin.bottom;
    
    var xScale = d3.scale.linear()
        .domain([xMin, xMax])
        .range([0, width]);

    var yScale = d3.scale.linear()
        .domain([0, yMax])
        .range([height, 0]);

    var xAxis = d3.svg.axis()
        .scale(xScale)
        .orient("bottom")
        .innerTickSize(-height)
        .outerTickSize(0)
        .tickPadding(10);

    var yAxis = d3.svg.axis()
        .scale(yScale)
        .orient("left")
        .innerTickSize(-width)
        .outerTickSize(0)
        .tickPadding(10);

    var line = d3.svg.line()
        .x(function(d) { return xScale(d[0]); })
        .y(function(d) { return yScale(d[1]); });

    var svg = d3.select("#marketDepthPlot").append("svg")
        .attr("id", "depthPlot")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    svg.append("g")
        .attr("class", "x axis")
        .attr("transform", "translate(0," + height + ")")
        .call(xAxis)

    svg.append("g")
        .attr("class", "y axis")
        .call(yAxis)

    // Asks
    svg.append("path")
        .data([datasets[0]])
        .attr("class", "lineRed")
        .attr("d", line);
    // Bids
    svg.append("path")
        .data([datasets[1]])
        .attr("class", "lineGreen")
        .attr("d", line);
}

function SetAskBidDisplay(depth)
{
    if (depth === null) {
        $("#minAsk").html("N/A");
        $("#maxBid").html("N/A");
        $("#minAskAge").html("0");
        $("#maxBidAge").html("0");
        return;
    }

    var minAskInd = 0;
    var maxBidInd = depth.bids.length - 1;
    $("#minAsk").html(depth.asks[minAskInd][0]);
    $("#maxBid").html(depth.bids[maxBidInd][0]);
    
    var minAskDate = new Date(depth.asks[minAskInd][1][1]).getTime();
    var minAskAge = (Date.now() - minAskDate) / 1000.0;
    $("#minAskAge").html(minAskAge.toString());
    var maxBidDate = new Date(depth.bids[maxBidInd][1][1]).getTime();
    var maxBidAge = (Date.now() - maxBidDate) / 1000.0;
    $("#maxBidAge").html(maxBidAge.toString());
}

function ProcessDepthData(depth)
{
    if (depth.asks.length === 0 || depth.bids.length === 0) {
        ClearPlot();
        SetAskBidDisplay(null);
        return;
    }

    SetAskBidDisplay(depth);

    var depthMargin = 0.1;
    var minAsk = parseFloat(depth.asks[0][0]);
    var maxBid = parseFloat(depth.bids[depth.bids.length - 1][0]);
    var avgPrice = (minAsk + maxBid) / 2.0;
    var depthPriceMin = avgPrice * (1.0 - depthMargin);
    var depthPriceMax = avgPrice * (1.0 + depthMargin);

    var asks = [];
    var bids = [];
    for (var i = 0; i < depth.asks.length; i++) {
        var price = parseFloat(depth.asks[i][0]);
        if (price < depthPriceMin || price > depthPriceMax) {
            continue;
        }
        var volume = parseFloat(depth.asks[i][1][0]);
        asks.push([price, volume]);
    }
    for (var i = 0; i < depth.bids.length; i++) {
        var price = parseFloat(depth.bids[i][0]);
        if (price < depthPriceMin || price > depthPriceMax) {
            continue;
        }
        var volume = parseFloat(depth.bids[i][1][0]);
        bids.push([price, volume]);
    }

    for (var i = 1; i < asks.length; i++) {
        asks[i][1] += asks[i-1][1];
    }
    for (var i = bids.length - 1; i > 0; i--) {
        bids[i-1][1] += bids[i][1];
    }

    ClearPlot();
    Plot([asks, bids], depthPriceMin, depthPriceMax);
}