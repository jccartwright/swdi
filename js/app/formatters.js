define({
    parseNx3structure: function(results) {
        console.log('inside parseNx3structure...');
        /* 
        e.g.
            [
            {"MAX_REFLECT":"46","SHAPE":"POINT (-105.087486400579 39.6700222024728)","VIL":"7","WSR_ID":"KPUX","CELL_ID":"P4","ZTIME":"2019-05-18T00:09:58Z","AZIMUTH":"330","RANGE":"84"}
            ]
        */
        var parsedData = [];
        results.forEach(function(result) {
            var coords = this.extractCoordsFromWKT(result.SHAPE)
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



});