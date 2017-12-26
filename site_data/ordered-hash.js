function BinarySearchOrPrev(array, val, cmpFunc)
{
    var minIndex = 0;
    var maxIndex = array.length - 1;
 
    while (minIndex <= maxIndex) {
        var curIndex = (minIndex + maxIndex) / 2 | 0;
        var curVal = array[curIndex];
        var cmp = cmpFunc(curVal, val);
 
        if (cmp < 0) {
            minIndex = curIndex + 1;
        }
        else if (cmp > 0) {
            maxIndex = curIndex - 1;
        }
        else {
            return [curIndex, -1];
        }
    }
 
    return [-1, minIndex];
}

function MakeOrderedHash(cmpFunc) {
    var keys = [];
    var vals = {};
    return {
        insert: function(k, v) {
            if (!vals[k]) {
                var pos = BinarySearchOrPrev(keys, k, cmpFunc)[1];
                keys.splice(pos, 0, k);
                vals[k] = v;
            }
        },
        delete: function(k) {
            if (!vals[k]) {
                console.error("delete unexistent key");
                return;
            }
            var pos = BinarySearchOrPrev(keys, k, cmpFunc)[0];
            keys.splice(pos, 1);
            delete vals[k];
        },
        clear: function() {
            keys = [];
            vals = {};
        },
        exists: function(k) {
            if (!vals[k])   return false;
            else            return true;
        },
        set:    function(k, v) {
            if (!vals[k]) {
                console.error("set unexistent key");
                return;
            }
            vals[k] = v;
        },
        entry:  function(k) {
            return [k, vals[k]];
        },
        entryByIndex:  function(idx) {
            return [keys[idx], vals[keys[idx]]];
        },
        val:    function(k) { return vals[k] },
        length: function()  { return keys.length },
        keys:   function()  { return keys },
        values: function()  { return vals }
    };
}

exports.Create = MakeOrderedHash;