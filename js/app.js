require([
    "dojo/on",
    "dojo/dom",
    "esri/Graphic",
    "esri/layers/GraphicsLayer",
    "esri/Map",
    "esri/views/MapView",
    "esri/request",
    "esri/widgets/Home",
    "esri/widgets/Search",
    "esri/geometry/support/webMercatorUtils"
], function (on, dom, Graphic, GraphicsLayer, Map, MapView, esriRequest, Home, Search, webMercatorUtils) {
    const CONUS_CENTROID = [-98.5795, 39.8283];

    // WARNING: global variable
    var geolocation = null;


    // setup button handlers
    // var getDataButton = dom.byId('getDataButton');
    // on(getDataButton, "click", getSummaryData);
    var resetButton = dom.byId('resetButton');
    on(resetButton, "click", reset);
    var dateSelect = dom.byId('dateSelect');
    on(dateSelect, "change", dateChangeHandler);
    var dateSelect = dom.byId('datasetSelect');
    on(datasetSelect, "change", getSummaryData);
    // one style better than another?
    //dateSelect.addEventListener("change", dateChangeHandler);
    var yearSelect = dom.byId('yearSelect');
    on(yearSelect, 'change', getSummaryData);


    // TODO fill symbol not working
    // Create a symbol for rendering the tile boundary graphic
    var fillSymbol = {
        type: "simple-fill", // autocasts as new SimpleFillSymbol()
        color: [255, 255, 0, 0.2],
        outline: {
            // autocasts as new SimpleLineSymbol()
            color: [255, 0, 0],
            width: 1
        }
    };

    var markerSymbol = {
        type: "simple-marker", // autocasts as new SimpleMarkerSymbol()
        color: [226, 119, 40],
        outline: {
            // autocasts as new SimpleLineSymbol()
            color: [255, 255, 255],
            width: 2
        }
    };

    // setup map and view
    var map = new Map({
        basemap: "streets"
    });

    // points for the select dataset and date
    var pointsLayer = new GraphicsLayer({ title: 'events' });
    map.add(pointsLayer);

    var view = new MapView({
        container: "viewDiv",
        map: map,
        zoom: 3,
        center: CONUS_CENTROID
    });

    // view.ui.add("select-by-polygon", "top-left");
    // const selectButton = document.getElementById("select-by-polygon");
    // selectButton.addEventListener("click", function() {
    //     console.log('button click');
    // });

    var homeWidget = new Home({
        view: view
    });
    view.ui.add(homeWidget, "top-left");

    const tooltip = document.getElementById("tooltip");
    view.on("pointer-move", event => {
        const { x, y } = event;
        view.hitTest(event).then(({ results }) => {
            // points will always fall w/in rectangle so there will be 2 results when over point
            if (results.length > 1 && results[1].graphic.layer.title == 'events') {
                var marker = results[1].graphic;
                tooltip.style.display = "block";
                tooltip.style.top = `${y - 120}px`;
                tooltip.style.left = `${x - 260 / 2}px`;
                var att = marker.attributes;
                tooltip.innerHTML = `Time(UTC): ${att.ztime}<br>Radar ID: ${att.wsr_id}<br>DBZ: ${att.max_reflect}<br>VIL:${att.vil} kg/m&sup2;<br>Azimuth: ${att.azimuth}&deg;<br>Range: ${att.range} nm<br>lat/lon: ${marker.geometry.latitude.toFixed(3)}, ${marker.geometry.longitude.toFixed(3)} `;

            } else {
                tooltip.style.display = "none";
            }
        });
    });

    // view click conflicts w/ the popup on Graphic  
    view.on("click", function (event) {
        // don't need popup since just collecting the coordinate
        view.popup.autoOpenEnabled = false;

        // Get the coordinates of the click on the map view
        setGeolocation(event.mapPoint.longitude, event.mapPoint.latitude);

        // match the zoom level used by Search widget
        view.goTo({ target: event.mapPoint, zoom: 12 }, { duration: 2000 })
    });

    // geocode widget
    var searchWidget = new Search({
        view: view,
        popupEnabled: false
    });

    view.ui.add(searchWidget, {
        position: "top-right",
        index: 0
    });

    searchWidget.watch("resultGraphic", function (resultGraphic) {
        // resultGraphic can be null when resetting the Search widget
        if (resultGraphic) {
            setGeolocation(resultGraphic.geometry.longitude, resultGraphic.geometry.latitude);
        }
    });


    //  
    // supporting functions
    // 
    function getSummaryData(evt) {
        // console.log('inside getSummaryData()...', evt);
        if (!geolocation) {
            alert("please select a geolocation");
            return;
        }

        // empty out Date select and points while waiting on new annual summary data
        clearDateSelect();
        clearPoints();

        // e.g. https://www.ncdc.noaa.gov/swdiws/csv/nx3structure/20190101:20200101?stat=tilesum:-105,40
        var datasetSelect = document.getElementById('datasetSelect');
        var dataset = datasetSelect.options[datasetSelect.selectedIndex].value;
        var yearSelect = document.getElementById('yearSelect');
        var startYear = parseInt(yearSelect.options[yearSelect.selectedIndex].value);
        var endYear = startYear + 1;
        var url = 'https://www.ncdc.noaa.gov/swdiws/json/' + dataset + '/' + startYear + '0101:' + endYear + '0101';
        console.log("retrieving summary data for " + dataset + ' in '+ startYear, url);
        displayMessage("retrieving summary data for " + dataset + ' in '+ startYear + ". Please standby...");
        esriRequest(url, {
            query: {
                stat: "tilesum:" + geolocation
            },
            responseType: "json"
        }).then(function (response) {
            var summaryData = response.data;
            //   console.log(summaryData);
            var stats = countSummaryData(summaryData.result);
            displayMessage("data retrieved - found " + stats.totalEvents + " events across " + stats.numberOfDays + " days.");

            // populate date select
            addDateSelectOptions(summaryData.result);

            // fire the handler to display the first day
            dateChangeHandler();
        });
    }


    function countSummaryData(results) {
        totalEvents = 0;
        results.forEach(function (result) {
            totalEvents = totalEvents + parseInt(result.FCOUNT);
        });
        return ({ 'numberOfDays': results.length, 'totalEvents': totalEvents });
    }


    function addDateSelectOptions(results) {
        var dateSelect = document.getElementById('dateSelect');

        // remove any previously existing options
        clearDateSelect();

        // add options corresponding to most recent search results
        results.forEach(function (result) {
            var option = document.createElement("option");
            option.value = result.DAY;
            option.text = result.DAY + ' (' + result.FCOUNT + ' events)';
            dateSelect.add(option);
        });
        dateSelect.style.setProperty('display', 'inline-block')
    }


    function clearDateSelect() {
        // console.log('inside clearDateSelect...');
        var dateSelect = document.getElementById('dateSelect');
        dateSelect.style.setProperty('display', 'none')

        var i;
        for (i = dateSelect.options.length - 1; i >= 0; i--) {
            dateSelect.remove(i);
        }
    }


    // TODO draw tile boundaries on map
    function setGeolocation(longitude, latitude) {
        var lat = Math.round(latitude * 1000) / 1000;
        var lon = Math.round(longitude * 1000) / 1000;
        addTileBoundary(lon, lat);
        geolocation = lon + "," + lat;
        //   document.getElementById('geolocationInput').value = geolocation;
        displayMessage("coordinates " + geolocation + " selected.");
        getSummaryData();
    }


    function addTileBoundary(longitude, latitude) {
        var lat = Math.round(latitude * 10) / 10;
        var lon = Math.round(longitude * 10) / 10;

        var minx = (lon - 0.05).toFixed(2);
        var miny = (lat - 0.05).toFixed(2);
        var maxx = (lon + 0.05).toFixed(2);
        var maxy = (lat + 0.05).toFixed(2);

        // ring must be in CW order for fill to work.
        var graphic = new Graphic({
            geometry: {
                type: "polygon",
                rings: [
                    [minx, miny],
                    [minx, maxy],
                    [maxx, maxy],
                    [maxx, miny]
                ]
            },
            symbol: fillSymbol
        });

        // remove any existing graphics
        view.graphics.removeAll();

        view.graphics.add(graphic);

        // re-center on grid
        view.goTo({ target: graphic.geometry.center, zoom: 12 });
    }


    function reset() {
        // console.log('inside reset...');
        geolocation = null;
        // document.getElementById('geolocationInput').value = geolocation;
        document.getElementById('datasetSelect').selectedIndex = 0;

        view.goTo({ target: CONUS_CENTROID, zoom: 3 });
        view.graphics.removeAll();
        clearPoints();
        clearDateSelect();
        displayMessage(welcomeMessage);
    }


    function dateChangeHandler(evt) {
        // console.log('inside dateChangeHandler...');
        // var day = evt.target.options[evt.target.selectedIndex].value;
        var dateSelect = document.getElementById('dateSelect');
        if (dateSelect.options.length == 0) {
            alert('You must first retrieve data for the year');
            return;
        }
        var day = dateSelect.options[dateSelect.selectedIndex].value;

        getDailyData(day);
    }


    function getDailyData(day) {
        // console.log('inside getDailyData with ',day);

        // reformat day value into yyyymmdd
        var date = day.split('-').join('');

        var datasetSelect = document.getElementById('datasetSelect');
        var dataset = datasetSelect.options[datasetSelect.selectedIndex].value;

        displayMessage("retrieving data for " + dataset + " on " + day + ". Please standby...");

        // e.g. https://www.ncdc.noaa.gov/swdiws/csv/nx3structure/20190601?tile=-105.117,39.678
        var url = 'https://www.ncdc.noaa.gov/swdiws/json/' + dataset + '/' + date;
        console.log("retrieving data for " + dataset + " on " + day, url);

        esriRequest(url, {
            query: {
                tile: geolocation
            },
            responseType: "json"
        }).then(function (response) {
            var dailyData = response.data;
            //   console.log(dailyData.result);

            displayMessage(dailyData.result.length + ' events retrieved.');

            drawPoints(dailyData.result);
        });
    }

    var pointPopupTemplate = {
        // autocasts as new PopupTemplate()
        title: "{ztime}",
        content: [
            {
                type: "fields",
                fieldInfos: [
                    {
                        fieldName: "max_reflect"
                    },
                    {
                        fieldName: "cell_id"
                    },
                    {
                        fieldName: "wsr_id"
                    }
                ]
            }
        ]
    };

    function drawPoints(results) {
        // console.log('inside draw points with '+results.length+' results...');

        // clear any existing graphics
        clearPoints();
        
        // generate list of Points and Graphics
        var graphics = [];
        results.forEach(function (result) {
            // bit of a hack to pull lon, lat from WKT string. depends on format like: "POINT (-105.083963633382 39.8283363414173)"
            var coords = result.SHAPE.substring(7, result.SHAPE.length - 1).split(' ');
            graphics.push(new Graphic({
                geometry: {
                    type: "point", // autocasts as new Point()
                    longitude: coords[0],
                    latitude: coords[1]
                },
                symbol: markerSymbol,
                attributes: {
                    max_reflect: result.MAX_REFLECT,
                    vil: result.VIL,
                    wsr_id: result.WSR_ID,
                    cell_id: result.CELL_ID,
                    azimuth: result.AZIMUTH,
                    range: result.RANGE,
                    ztime: result.ZTIME
                },
                //   popupTemplate: pointPopupTemplate
            })
            );
        });
        pointsLayer.addMany(graphics);
    }


    function clearPoints() {
        pointsLayer.removeAll();
    }
});



//
// the follow don't have any JSAPI dependencies and are outside the module loading callback
//
var welcomeMessage = "Welcome to NOAA's Severe Weather Data Inventory.<br>Begin by searching for a location of interest...";

function init() {
    // console.log('inside init...');
    populateYearSelect();
    displayMessage(welcomeMessage);
}


function displayMessage(message) {
    var messagePanel = document.getElementById("messagePanel");
    messagePanel.innerHTML = message;
}


function populateYearSelect() {
    var currentYear = new Date().getFullYear();
    var yearSelect = document.getElementById("yearSelect");
    for (i = currentYear; i >= 1992; i--) {
        var option = document.createElement("option");
        option.text = i;
        yearSelect.add(option);
    }
    yearSelect.options[0].selected = true;
}

function showDatasetHelp() {
    document.getElementById('datasetHelp').style.setProperty('display', 'block');
}

function hideDatasetHelp() {
    document.getElementById('datasetHelp').style.setProperty('display', 'none');
}



