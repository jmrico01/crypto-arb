function MakeFixedQueue(size) {
    if (!Number.isInteger(size)) {
        console.assert(false, "Fixed queue non-integer size");
        return null;
    }

    array = [];
    array.length = size;
    start = 0;
    end = 0;

    return {
        Enqueue: function(item) {
            array[end] = item;
            
        },
        Dequeue: function() {
        },
        GetLength: function() {
            if (start < end) {
                return end - start;
            }
            else {
                return end + array.length - start;
            }
        },
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