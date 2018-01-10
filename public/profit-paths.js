var $pathStartProto;
var $pathArrowProto;
var $pathNodeProto;
var $pathEndProto;

function CreatePathArrow(width)
{
    var $pathArrow = $pathArrowProto.clone();
    $pathArrow.width(width);
    $pathArrow.find("line").attr("x2", (width * 0.85).toString());

    return $pathArrow;
}

function ClearProfitPaths(parent)
{
    //return;
    $(parent).html("");
}

function DisplayProfitPaths(parent, paths)
{
    //return;
    var $profitPaths = $(parent);

    for (var i = 0; i < paths.length; i++) {
        var $path = $("<div class=\"path\"></div>");
        var pathEls = 2 * (paths[i][1].length - 2) + 1 + 2;
        for (var el = 0; el < pathEls; el++) {
            var width = 100.0/pathEls;
            var $pathEl = $("<div class=\"pathEl\" style=\"width:"
                + width.toString() + "%;\"></div>");
            $path.append($pathEl);

            if (el === 0) {
                var $pathStart = $pathStartProto.clone();
                $pathEl.append($pathStart);
            }
            else if (el === (pathEls - 1)) {
                var $pathEnd = $pathEndProto.clone();
                $pathEnd.find(".endPerc").html(
                    ((paths[i][0][0] - 1.0) * 100.0).toFixed(2));
                $pathEnd.find(".endFlat").html(
                    paths[i][0][1].toFixed(2));
                $pathEl.append($pathEnd);
            }
            else if (el % 2 === 1) {
                $pathEl.append(CreatePathArrow(width * 4));
            }
            else {
                var n = el / 2;
                var $pathNode = $pathNodeProto.clone();
                $pathNode.find(".pathNodeSite").html(
                    paths[i][1][n].split("-")[0]);
                $pathNode.find(".pathNodeCurrency").html(
                    paths[i][1][n].split("-")[1]);
                $pathEl.append($pathNode);
            }
        }

        $profitPaths.append($path);
    }
}

$(function() {
    // Setup profit path rendering
    $pathStartProto = $($("#pathStartProto").html());
    $pathArrowProto = $($("#pathArrowProto").html());
    $pathNodeProto = $($("#pathNodeProto").html());
    $pathEndProto = $($("#pathEndProto").html());
    $(".pathEl").each(function() {
        var $this = $(this);
        if ($this.html().trim() === "arrow-here") {
            $this.html($("#pathArrowProto").html());
        }
    });
    /*ClearProfitPaths();

    DisplayProfitPaths([
        [
            [1.14, 50.00, 0.0],
            ["start", "Kraken-USD", "Kraken-ETH", "CEX-ETH", "CEX-USD", "end"]
        ],
        [
            [1.10, 45.00, 0.0],
            ["start", "Bitstamp-USD", "Bitstamp-DASH", "Kraken-DASH",
                "Kraken-USD", "Kraken-ZEC", "CEX-ZEC", "CEX-USD", "end"]
        ]
    ]);*/
});