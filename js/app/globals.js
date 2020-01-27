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
        }
    };
});