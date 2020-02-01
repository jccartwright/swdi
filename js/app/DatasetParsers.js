define(["dojo/_base/declare", 'dojo/_base/lang'], function(declare, lang) { 
    return declare(null, {
        
        parseNx3structure: function(results) {
            /* 
            e.g.
                [
                {"MAX_REFLECT":"46","SHAPE":"POINT (-105.087486400579 39.6700222024728)","VIL":"7","WSR_ID":"KPUX","CELL_ID":"P4","ZTIME":"2019-05-18T00:09:58Z","AZIMUTH":"330","RANGE":"84"}
                ]
            */
            var parsedData = [];
            results.forEach(function(result) {
                // WARNING - this is not working correctly.
                var coords = extractCoordsFromWKT(result.SHAPE)
                result.SHAPE = coords;
                parsedData.push(result)
            })
        
            return({'events': parsedData, 'dataset':'nx3structure'});
        },


        extractCoordsFromWKT: function(wkt) {
            // bit of a hack to pull lon, lat from WKT string. depends on format like: "POINT (-105.083963633382 39.8283363414173)"
            var coords = wkt.substring(7, wkt.length - 1).split(' ');
            // TODO standardize the precision of the coords
            return(coords);
        }
    })
});
