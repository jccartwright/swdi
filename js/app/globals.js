// define a class in the module
// 
// define ([
//     'dojo/_base/declare'
// ],
// function (
//     declare
// ) {
//     return declare([], {
//         name: 'jcc',

//         getName: function() {
//             return this.name;
//         }
//     });
// });

// define an object (not a class) containing functions
define(function(){
    // variables are private due to closure and only accessible via the functions in the returned object.
    var name = 'SWDI';

    var tableColumns = {
        'nx3structure': [
            {field: 'OBJECTID', label: 'OBJECTID', sortable: true, hidden: true },
            {field: 'ZTIME', label: 'Time', sortable: true},
            {field: 'WSR_ID', label: 'WSR ID', sortable: true},
            {field: 'CELL_ID', label: 'Cell ID', sortable: true},
            {field: 'AZIMUTH', label: 'Azimuth', sortable: true},
            {field: 'MAX_REFLECT', label: 'Max Reflect', sortable: true},
            {field: 'RANGE', label: 'Range', sortable: true},
            {field: 'VIL', label: 'VIL', sortable: true}
        ],

        'nx3structure_all': [
            {field: 'OBJECTID', label: 'OBJECTID', sortable: true, hidden: true },
            {field: 'ZTIME', label: 'Time', sortable: true},
            {field: 'WSR_ID', label: 'WSR ID', sortable: true},
            {field: 'CELL_ID', label: 'Cell ID', sortable: true},
            {field: 'AZIMUTH', label: 'Azimuth', sortable: true},
            {field: 'MAX_REFLECT', label: 'Max Reflect', sortable: true},
            {field: 'RANGE', label: 'Range', sortable: true},
            {field: 'VIL', label: 'VIL', sortable: true}
        ],

        'nx3hail': [
            {field: 'OBJECTID', label: 'OBJECTID', sortable: true, hidden: true },
            {field: 'ZTIME', label: 'Time', sortable: true},
            {field: 'WSR_ID', label: 'WSR ID', sortable: true},
            {field: 'CELL_ID', label: 'Cell ID', sortable: true},
            {field: 'PROB', label: 'Probability', sortable: true},
            {field: 'MAXSIZE', label: 'Max Size', sortable: true},
            {field: 'SEVPROB', label: 'Severe Probability', sortable: true}
        ],

        'nx3hail_all': [
            {field: 'OBJECTID', label: 'OBJECTID', sortable: true, hidden: true },
            {field: 'ZTIME', label: 'Time', sortable: true},
            {field: 'WSR_ID', label: 'WSR ID', sortable: true},
            {field: 'CELL_ID', label: 'Cell ID', sortable: true},
            {field: 'PROB', label: 'Probability', sortable: true},
            {field: 'MAXSIZE', label: 'Max Size', sortable: true},
            {field: 'SEVPROB', label: 'Severe Probability', sortable: true}
        ],

        'nx3meso': [
            {field: 'OBJECTID', label: 'OBJECTID', sortable: true, hidden: true }
        ],

        'nx3mda': [
            {field: 'OBJECTID', label: 'OBJECTID', sortable: true, hidden: true },
            {field: 'ZTIME', label: 'Time', sortable: true},
            {field: 'WSR_ID', label: 'WSR ID', sortable: true},
            {field: 'CELL_ID', label: 'Cell ID', sortable: true},
            {field: 'STR_RANK', label: 'Strength Ranking', sortable: true},
            {field: 'MSI', label: 'MSI', sortable: true},
            {field: 'LL_DV', label: 'Low Level DV (knots)', sortable: true},
            {field: 'MOTION_KTS', label: 'Motion Speed (knots)', sortable: true},
            {field: 'MAX_RV_KTS', label: 'Max RV (knots)', sortable: true},
            {field: 'TVS', label: 'TVS (Y or N)', sortable: true},
            {field: 'LL_BASE', label: 'Base (kft)', sortable: true},
            {field: 'DEPTH_KFT', label: 'Depth (kft)', sortable: true},
            {field: 'MOTION_DEG', label: 'Motion Direction (deg)', sortable: true},
            {field: 'SCIT_ID', label: 'ID from SCIT algorithm (used in other NEXRAD products)', sortable: true},
            {field: 'DPTH_STMRL', label: 'STMRL (percent)', sortable: true},
            {field: 'MAX_RV_KFT', label: 'Max RV Height(kft)', sortable: true},
            {field: 'AZIMUTH', label: 'Azimuth (deg)', sortable: true},
            {field: 'LL_ROT_VEL', label: 'Low Level RV (knots)', sortable: true},
            {field: 'RANGE', label: 'Range (nautical mi)', sortable: true}
        ],

        'nx3tvs': [
            {field: 'OBJECTID', label: 'OBJECTID', sortable: true, hidden: true },
            {field: 'ZTIME', label: 'Time', sortable: true},
            {field: 'WSR_ID', label: 'WSR ID', sortable: true},
            {field: 'CELL_ID', label: 'Cell ID', sortable: true},
            {field: 'RANGE', label: 'Range (nautical mi)', sortable: true},
            {field: 'AZIMUTH', label: 'Azimuth (deg)', sortable: true},
            {field: 'MAX_SHEAR', label: 'Max Shear (e-3/s', sortable: true},
            {field: 'MXDV', label: 'MXDV (knots)', sortable: true}
        ],

        'nldn': [
            {field: 'OBJECTID', label: 'OBJECTID', sortable: true, hidden: true },
            {field: 'DATASOURCE', label: 'Datasource', sortable: true},
            {field: 'DETECTOR_QUANTITY', label: 'Detector Quantity', sortable: true},
            {field: 'MESSAGE_TYPE', label: 'Message Type', sortable: true},
            {field: 'MILLISECONDS', label: 'Milliseconds', sortable: true},
            {field: 'POLARITY', label: 'Polarity', sortable: true},
            {field: 'STROKE_COUNT', label: 'Stroke Count', sortable: true},
            {field: 'STROKE_STRENGTH', label: 'Stroke Strength', sortable: true},
            {field: 'STROKE_TYPE', label: 'Stroke Type', sortable: true}
        ]
    };

    // Create a symbol for rendering the tile boundary graphic. Tile is the "island" within the defined polygon
    var fillSymbol = {
        type: "simple-fill",
        color: [205, 205, 205, 0.5],
        outline: {
            color: [0, 0, 0],
            width: 3
        }
    };

    // symbology for event markers
    var markerSymbol = {
        type: "simple-marker",
        color: [0,0,255],
        outline: {
            color: [0,0,0],
            width: 1
        }
    };

    
    return {
        getName: function() {
            return name;
        },

        getFillSymbol: function() {
            return fillSymbol;
        },

        getMarkerSymbol: function() {
            return markerSymbol;
        },

        getColumns: function(dataset) {
            return(tableColumns[dataset]);
        }
    };
});