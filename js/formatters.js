function parseNx3structure(results) {
    console.log('inside parseNx3structure...');
    /* 
    e.g.
        [
        {"MAX_REFLECT":"46","SHAPE":"POINT (-105.087486400579 39.6700222024728)","VIL":"7","WSR_ID":"KPUX","CELL_ID":"P4","ZTIME":"2019-05-18T00:09:58Z","AZIMUTH":"330","RANGE":"84"}
        ]
    */
    var parsedData = [];
    results.forEach(function(result) {
        var coords = extractCoordsFromWKT(result.SHAPE)
        result.SHAPE = coords;
        parsedData.push(result)
   })

   return({'events': parsedData, 'dataset':'nx3structure'});
}


function parseNx3hail(results) {
    /* 
    e.g.
        [
        {"PROB":"100","SHAPE":"POINT (-105.022116449117 39.6794851127902)","WSR_ID":"KPUX","CELL_ID":"U5","ZTIME":"2019-05-28T07:05:57Z","SEVPROB":"70","MAXSIZE":"1.25"}
        ]
    */
    var parsedData = [];
    results.forEach(function(result) {
        var coords = extractCoordsFromWKT(result.SHAPE)
        result.SHAPE = coords;
        parsedData.push(result)
   })

   return({'events': parsedData, 'dataset':'nx3hail'});
}


function parseNldn(results) {
    /* 
    e.g.
        [
        {"MILLISECONDS":"130","DETECTOR_QUANTITY":"6","POLARITY":"N","STROKE_COUNT":"1","SDO_POINT_TYPE":"POINT (-105.076 39.663)","DATASOURCE":"A","STROKE_STRENGTH":"11.2","MESSAGE_TYPE":"FL","STROKE_TYPE":"CG","ZTIME":"2019-05-18T00:15:57Z"}
        ]
    */
    var parsedData = [];
    results.forEach(function(result){
        var coords = extractCoordsFromWKT(result.SDO_POINT_TYPE)

        // standardize the geometry field
        delete result.SDO_POINT_TYPE
        result.SHAPE = coords
       
       parsedData.push(result)
   })

   return({'events': parsedData, 'dataset': 'nldn'});
}


function parseNx3tvs(results) {
    /* 
    e.g.
    [
    {"CELL_TYPE":"TVS","SHAPE":"POINT (-105.001045144039 40.0443316122911)","MAX_SHEAR":"40","WSR_ID":"KDEN","MXDV":"73","CELL_ID":"Q0","ZTIME":"2018-07-05T21:50:29Z","AZIMUTH":"311","RANGE":"29"}
    ]
    */
    var parsedData = [];
    results.forEach(function(result){
        var coords = extractCoordsFromWKT(result.SHAPE)
        result.SHAPE = coords
       
       parsedData.push(result)
   })

   return({'events': parsedData, 'dataset': 'nx3tvs'});
}


function parseNx3mda(results) {
    // console.log('inside parseNx3mda.', results);
    /* 
    e.g.
        [
        {"STR_RANK":"7","MSI":"3996","LL_DV":"82","MOTION_KTS":"-999","WSR_ID":"KDEN","CELL_ID":"795","MAX_RV_KTS":"49","TVS":"N","SHAPE":"POINT (-105.023470692909 39.9947802649673)","LL_BASE":"8","DEPTH_KFT":"12","MOTION_DEG":"-999","SCIT_ID":"H0","DPTH_STMRL":"0","ZTIME":"2018-05-13T01:09:31Z","MAX_RV_KFT":"17","AZIMUTH":"305","LL_ROT_VEL":"38","RANGE":"28"}
        ]
    */
    var parsedData = [];
    results.forEach(function(result){
        var coords = extractCoordsFromWKT(result.SHAPE)

        result.SHAPE = coords;
        parsedData.push(result)           
   })

   return({'events': parsedData, 'dataset': 'nx3mda'});
}


function extractCoordsFromWKT(wkt) {
    // bit of a hack to pull lon, lat from WKT string. depends on format like: "POINT (-105.083963633382 39.8283363414173)"
    var coords = wkt.substring(7, wkt.length - 1).split(' ');
    // TODO standardize the precision of the coords
    return(coords);
}


