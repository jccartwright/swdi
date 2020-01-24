require([
    "dojo/_base/declare",
    "dgrid/Grid",
    "dgrid/OnDemandGrid",
    "dgrid/extensions/ColumnHider",
    "dgrid/Selection",
    "dstore/Memory",
    "dojo/on",
    "dojo/dom",
    "esri/Graphic",
    "esri/layers/GraphicsLayer",
    "esri/Map",
    "esri/views/MapView",
    "esri/request",
    "esri/widgets/Home",
    "esri/widgets/Search",
    "esri/geometry/support/webMercatorUtils",
    "app/globals",
    "dojo/domReady!"
], function (
    declare,
    Grid,
    OnDemandGrid,
    ColumnHider,
    Selection,
    Memory,
    on, 
    dom, 
    Graphic, 
    GraphicsLayer, 
    Map, 
    MapView, 
    esriRequest, 
    Home, 
    Search, 
    webMercatorUtils, 
    myglobals
    ) {
    populateYearSelect();

    // console.log('myglobals', myglobals);
    // console.log(myglobals.getName());
    
    const CONUS_CENTROID = [-98.5795, 39.8283];
    const gridDiv = document.getElementById("grid");

    var CustomGrid = declare([Grid, Selection, ColumnHider]);

    // WARNING: global variable
    var geolocation = null;
    var selectedDay = null;
    // convenience to reduce noise in referencing DOM elements
    var domElements = {
        'downloadPanel': document.getElementById('downloadPanel'),
        'introPanel': document.getElementById('introPanel'),
        'dateSelect': document.getElementById('dateSelect'),
        'disclaimerPanel': document.getElementById('disclaimerPanel'),
        'datasetSelect': document.getElementById('datasetSelect'),
        'downloadFormats': document.getElementById('downloadFormats'),
        'yearSelect': document.getElementById('yearSelect')
    }
    
    var state = {
        geolocation: null,
        // the following two variables refer to the state of the dateSelect and not the calendar
        previousDay: null,
        currentDay: null,
        year: null,
        dataset: null,
        
        formatDate: function() {
            // reformat day value into yyyymmdd
            return (this.day.split('-').join(''));
        },

        update: function() {
            var datasetSelect = domElements.datasetSelect;
            this.dataset = datasetSelect.options[datasetSelect.selectedIndex].value;
    
            var yearSelect = domElements.yearSelect;
            this.year = parseInt(yearSelect.options[yearSelect.selectedIndex > 0 ? yearSelect.selectedIndex: 0].value);
    
            var dateSelect = domElements.dateSelect;
            if (dateSelect.options.length) {
                this.currentDay = dateSelect.options[dateSelect.selectedIndex ? dateSelect.selectedIndex: 0].value;
            }    
        }
    }

    // function updateState() {
    //     console.log('inside updateState...');
    //     var datasetSelect = domElements.datasetSelect;
    //     state.dataset = datasetSelect.options[datasetSelect.selectedIndex].value;

    //     var yearSelect = domElements.yearSelect;
    //     state.year = parseInt(yearSelect.options[yearSelect.selectedIndex > 0 ? yearSelect.selectedIndex: 0].value);

    //     var dateSelect = domElements.dateSelect;
    //     if (dateSelect.options.length) {
    //         console.log(dateSelect);
    //         state.currentDay = dateSelect.options[dateSelect.selectedIndex ? dateSelect.selectedIndex: 0].value;
    //     }
    // }

    // debugging
    state.update();
    console.log(state);

    var grid = null;


    // setup button handlers
    // var getDataButton = dom.byId('getDataButton');
    // on(getDataButton, "click", getSummaryData);
    var resetButton = dom.byId('resetButton');
    on(resetButton, "click", reset);
    var dateSelect = dom.byId('dateSelect');
    on(dateSelect, "change", dateChangeHandler);
    var datasetSelect = dom.byId('datasetSelect');
    on(datasetSelect, "change", getSummaryData);
    // one style better than another?
    //dateSelect.addEventListener("change", dateChangeHandler);

    domElements.downloadFormats.addEventListener("change", downloadFormatChangeHandler);


    var yearSelect = dom.byId('yearSelect');
    on(yearSelect, 'change', getSummaryData);

    on(dom.byId('introBtn'), 'click', toggleIntroPanel);
    on(dom.byId('introPanel'), 'click', toggleIntroPanel);
    on(dom.byId('downloadBtn'), 'click', toggleDownloadPanel);
    on(dom.byId('downloadPanel'), 'click', toggleDownloadPanel);
    on(dom.byId('wsBtn'), 'click', function() {
        window.open('https://www.ncdc.noaa.gov/swdiws');
    });
    on(dom.byId('disclaimerBtn'), 'click', toggleDisclaimerPanel);
    on(dom.byId('disclaimerPanel'), 'click', toggleDisclaimerPanel);
    // on(dom.byId('creditsBtn'), 'click', toggleCreditsPanel);
    // on(dom.byId('creditsPanel'), 'click', toggleCreditsPanel);


    // Create a symbol for rendering the tile boundary graphic
    var fillSymbol = {
        type: "simple-fill", // autocasts as new SimpleFillSymbol()
        color: [205, 205, 205, 0.5],
        outline: {
            // autocasts as new SimpleLineSymbol()
            color: [0, 0, 0],
            width: 3
        }
    };

    var markerSymbol = {
        type: "simple-marker", // autocasts as new SimpleMarkerSymbol()
        color: [0,0,255],
        outline: {
            // autocasts as new SimpleLineSymbol()
            color: [0,0,0],
            width: 1
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
    view.ui.move("zoom", "top-right");

    // tool to select tile location from map
    // view.ui.add("select-by-polygon", "top-left");
    // const selectButton = document.getElementById("select-by-polygon");
    // selectButton.addEventListener("click", function() {
    //     console.log('button click');
    // });

    var homeWidget = new Home({
        view: view
    });
    view.ui.add(homeWidget, "top-right");

    const tooltip = document.getElementById("tooltip");
    view.on("pointer-move", event => {
        const { x, y } = event;
        view.hitTest(event).then(({ results }) => {
            // points will always fall w/in hole of rectangle
            if (results.length === 1 && results[0].graphic.layer.title == 'events') {
                var marker = results[0].graphic;
                tooltip.style.display = "block";
                tooltip.style.top = `${y - 80}px`;
                tooltip.style.left = `${x - 120 / 2}px`;
                var att = marker.attributes;
                tooltip.innerHTML = getGraphicTooltip(marker);

            } else {
                tooltip.style.display = "none";
            }
        });
    });

    // view click conflicts w/ the popup on Graphic.  
    view.on("click", function (event) {
        // don't need popup since just collecting the coordinate
        view.popup.autoOpenEnabled = false;

        view.hitTest(event).then(({ results }) => {
            // no current selection (i.e. frame on screen)
            if (view.graphics.length === 0) {
                mapClickHandler(event);
            //not on point nor on frame's exterior    
            } else if (results.length === 1 && results[0].graphic.layer.title !== 'events') {
                mapClickHandler(event);
            }
        });
    });

    // geocode widget
    var searchWidget = new Search({
        view: view,
        popupEnabled: false
    });
    view.ui.add(searchWidget, {
        position: "top-left",
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
    function createGrid(datasetName) {
        console.log('inside createGrid with ', datasetName);
        // clearGrid();

        // fields common to all datasets
        var columns = [
            {field: 'OBJECTID', label: 'OBJECTID', sortable: true, hidden: true },
        ]

        // add fields unique to given dataset
        switch (datasetName) {
            case 'nx3structure':
            case 'nx3structure_all':
                columns.push({field: 'ZTIME', label: 'Time', sortable: true});
                columns.push({field: 'WSR_ID', label: 'WSR ID', sortable: true});
                columns.push({field: 'CELL_ID', label: 'Cell ID', sortable: true});        
                columns.push({field: 'AZIMUTH', label: 'Azimuth', sortable: true});
                columns.push({field: 'MAX_REFLECT', label: 'Max Reflect', sortable: true});
                columns.push({field: 'RANGE', label: 'Range', sortable: true});
                columns.push({field: 'VIL', label: 'VIL', sortable: true});
                break;

            case 'nx3hail':
            case 'nx3hail_all':
                columns.push({field: 'ZTIME', label: 'Time', sortable: true});
                columns.push({field: 'WSR_ID', label: 'WSR ID', sortable: true});
                columns.push({field: 'CELL_ID', label: 'Cell ID', sortable: true});        
                columns.push({field: 'PROB', label: 'Probability', sortable: true});
                columns.push({field: 'MAXSIZE', label: 'Max Size', sortable: true});
                columns.push({field: 'SEVPROB', label: 'Severe Probability', sortable: true});
                break;

            case 'nx3meso':
                // have yet to find a response example
                break;

            case 'nx3mda':
                columns.push({field: 'ZTIME', label: 'Time', sortable: true});
                columns.push({field: 'WSR_ID', label: 'WSR ID', sortable: true});
                columns.push({field: 'CELL_ID', label: 'Cell ID', sortable: true});        
                columns.push({field: 'STR_RANK', label: 'Strength Ranking', sortable: true});
                columns.push({field: 'MSI', label: 'MSI', sortable: true});
                columns.push({field: 'LL_DV', label: 'Low Level DV (knots)', sortable: true});
                columns.push({field: 'MOTION_KTS', label: 'Motion Speed (knots)', sortable: true});
                columns.push({field: 'MAX_RV_KTS', label: 'Max RV (knots)', sortable: true});
                columns.push({field: 'TVS', label: 'TVS (Y or N)', sortable: true});
                columns.push({field: 'LL_BASE', label: 'Base (kft)', sortable: true});
                columns.push({field: 'DEPTH_KFT', label: 'Depth (kft)', sortable: true});
                columns.push({field: 'MOTION_DEG', label: 'Motion Direction (deg)', sortable: true});
                columns.push({field: 'SCIT_ID', label: 'ID from SCIT algorithm (used in other NEXRAD products)', sortable: true});
                columns.push({field: 'DPTH_STMRL', label: 'STMRL (percent)', sortable: true});
                columns.push({field: 'MAX_RV_KFT', label: 'Max RV Height(kft)', sortable: true});
                columns.push({field: 'AZIMUTH', label: 'Azimuth (deg)', sortable: true});
                columns.push({field: 'LL_ROT_VEL', label: 'Low Level RV (knots)', sortable: true});
                columns.push({field: 'RANGE', label: 'Range (nautical mi)', sortable: true});
                break;

            case 'nx3tvs':
                columns.push({field: 'ZTIME', label: 'Time', sortable: true});
                columns.push({field: 'WSR_ID', label: 'WSR ID', sortable: true});
                columns.push({field: 'CELL_ID', label: 'Cell ID', sortable: true});        
                columns.push({field: 'RANGE', label: 'Range (nautical mi)', sortable: true});
                columns.push({field: 'AZIMUTH', label: 'Azimuth (deg)', sortable: true});
                columns.push({field: 'MAX_SHEAR', label: 'Max Shear (e-3/s', sortable: true});
                columns.push({field: 'MXDV', label: 'MXDV (knots)', sortable: true});
                break;

            case 'plsr':
                // have yet to find a response example
                break;

            case 'nldn':
                columns.push({field: 'DATASOURCE', label: 'Datasource', sortable: true});
                columns.push({field: 'DETECTOR_QUANTITY', label: 'Detector Quantity', sortable: true});
                columns.push({field: 'MESSAGE_TYPE', label: 'Message Type', sortable: true});
                columns.push({field: 'MILLISECONDS', label: 'Milliseconds', sortable: true});
                columns.push({field: 'POLARITY', label: 'Polarity', sortable: true});
                columns.push({field: 'STROKE_COUNT', label: 'Stroke Count', sortable: true});
                columns.push({field: 'STROKE_STRENGTH', label: 'Stroke Strength', sortable: true});
                columns.push({field: 'STROKE_TYPE', label: 'Stroke Type', sortable: true});
                break;

            default:
            console.error('unrecognized dataset: ', dataset);
        }


        // var columns = [
        //     {field: '__OBJECTID', label: '__OBJECTID', sortable: true, hidden: true},
        //     {field: 'ZTIME', label: 'Time', sortable: true}
        // ]
        // create a new onDemandGrid with its selection and columnhider
        // extensions. Set the columns of the grid to display attributes
        // the hurricanes cvslayer
        console.log('creating new grid with columns', columns);
        // grid = null;
        // grid = new(declare([OnDemandGrid, Selection, ColumnHider]))({
        //     columns: columns
        //   }, "grid")

        // grid = new (OnDemandGrid.createSubclass([Selection, ColumnHider]))(
        //   {
        //     columns: columns
        //   },
        //   "grid"
        // );

        // hack to avoid "TypeError: Cannot read property 'element' of undefined"
        if (grid) {
            console.log('resetting columns');
            grid._setColumns([]);
            grid.refresh();
        }

        grid = new CustomGrid({
            columns: columns
        }, 'grid');

        // add a row-click listener on the grid. This will be used
        // to highlight the corresponding feature on the view
        // grid.on("dgrid-select", selectFeatureFromGrid);
        console.log('leaving createGrid...');
      }


    function downloadFormatChangeHandler(evt) {
        // console.log('inside downloadFormatChangeHandler with ', evt);
        var format = evt.target.options[evt.target.selectedIndex].value;
        if (! format) {
            alert("you must choose a valid format in which to download the day's data");
            return;
        }

        // global geolocation

        var datasetSelect = document.getElementById('datasetSelect');
        var dataset = datasetSelect.options[datasetSelect.selectedIndex].value;

        var dateSelect = document.getElementById('dateSelect');
        var day = dateSelect.options[dateSelect.selectedIndex].value;
        // reformat day value into yyyymmdd
        var date = day.split('-').join('');

        switch(format) {
            case 'csv':
                var url = 'https://www.ncdc.noaa.gov/swdiws/csv/' + dataset + '/' + date + '?tile=' + geolocation; 
                break;

            case 'json':
                url = 'https://www.ncdc.noaa.gov/swdiws/json/' + dataset + '/' + date + '?tile=' + geolocation; 
                break;

            case 'xml':
                url = 'https://www.ncdc.noaa.gov/swdiws/xml/' + dataset + '/' + date + '?tile=' + geolocation; 
                break;

            case 'kmz':
                url = 'https://www.ncdc.noaa.gov/swdiws/kmz/' + dataset + '/' + date + '?tile=' + geolocation; 
                break;

            case 'shp':
                url = 'https://www.ncdc.noaa.gov/swdiws/shp/' + dataset + '/' + date + '?tile=' + geolocation; 
                break;

            default:
                alert("you must choose a valid format in which to download the day's data");
                return;
        }
        window.open(url);
    }


    function toggleIntroPanel() {
        var panel = document.getElementById('introPanel');
        if (panel.style.display == 'none') {
            panel.style.display = 'inline-block';
        } else {
            panel.style.display = 'none';
        }
        document.getElementById('downloadPanel').style.display = 'none';
        document.getElementById('disclaimerPanel').style.display = 'none';
        // document.getElementById('creditsPanel').style.display = 'none';
    }


    function toggleDownloadPanel() {
        var panel = document.getElementById('downloadPanel');
        if (panel.style.display == 'none') {
            panel.style.display = 'inline-block';
        } else {
            panel.style.display = 'none';
        }    
        document.getElementById('introPanel').style.display = 'none';
        document.getElementById('disclaimerPanel').style.display = 'none';
        // document.getElementById('creditsPanel').style.display = 'none';
    }


    function toggleDisclaimerPanel() {
        var panel = document.getElementById('disclaimerPanel');
        if (panel.style.display == 'none') {
            panel.style.display = 'inline-block';
        } else {
            panel.style.display = 'none';
        }
        document.getElementById('downloadPanel').style.display = 'none';
        document.getElementById('introPanel').style.display = 'none';
        // document.getElementById('creditsPanel').style.display = 'none';
    }


    // function toggleCreditsPanel() {
    //     var panel = document.getElementById('creditsPanel');
    //     if (panel.style.display == 'none') {
    //         panel.style.display = 'inline-block';
    //     } else {
    //         panel.style.display = 'none';
    //     }
    //     document.getElementById('downloadPanel').style.display = 'none';
    //     document.getElementById('introPanel').style.display = 'none';
    //     document.getElementById('disclaimerPanel').style.display = 'none';
    // }


    function mapClickHandler(event) {
        // Get the coordinates of the click on the map view
        setGeolocation(event.mapPoint.longitude, event.mapPoint.latitude);

        // match the zoom level used by Search widget
        view.goTo({ target: event.mapPoint, zoom: 12 }, { duration: 2000 })
    }


    function newTileOrDatasetSelected() {

    }

    function getSummaryData() {
        console.log('inside getSummaryData()...');
        if (!geolocation) {
            alert("please select a geolocation");
            return;
        }

        // reset previously select day
        // selectedDay = null;

        state.update();
        console.log(state);

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
        // console.log("retrieving summary data for " + dataset + ' in '+ startYear, url);
        displayMessage("retrieving summary data for " + dataset + ' in '+ startYear + ". Please standby...");
        showSpinner();
        esriRequest(url, {
            query: {
                stat: "tilesum:" + geolocation
            },
            responseType: "json"
        }).then(function (response) {
            var summaryData = response.data;
            // console.log(summaryData);
            var stats = countSummaryData(summaryData.result);
            hideSpinner();

            createGrid(dataset);
            
            if (stats.totalEvents > 0) {
                displayMessage("data retrieved - found " + stats.totalEvents + " events across " + stats.numberOfDays + " days.");
            } else {
                displayMessage("no data found for " + dataset + ' in '+ startYear);
                hideGrid();
                return;
            }

            // populate date select
            addDateSelectOptions(summaryData.result);

            // default to the previously selected day, if any
            var dateSelect = document.getElementById('dateSelect');
            var inputGroup = document.getElementById('dateInputGroup');
            console.log('selectedDay', selectedDay);
            console.log('current selection: ',dateSelect.options[dateSelect.selectedIndex].value);
            if (! selectedDay || selectedDay === dateSelect.options[dateSelect.selectedIndex].value) {
                // fire the handler to display the previously selected day or default to first in list
                dateChangeHandler();
    
            } else {
                // no data for this tile, dataset, and date
                hideDateSelect();
                displayMessage("no data found for " + dataset + ' on '+ selectedDay);
                hideGrid();
            }
        
        },
        function(error){
            console.log('error in getting summary data', error);
            displayMessage("Error retrieving data from server. Please try again later");
            hideSpinner();
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
        var inputGroup = document.getElementById('dateInputGroup');

        // remove any previously existing options
        clearDateSelect();

        // add options corresponding to most recent search results
        results.forEach(function (result) {
            var option = document.createElement("option");
            option.value = result.DAY;
            option.text = result.DAY + ' (' + result.FCOUNT + ' events)';
            if (option.value == selectedDay) {
                option.selected = 'selected';
            }
            dateSelect.add(option);
        });
        dateSelect.style.setProperty('display', 'inline-block');
        inputGroup.style.setProperty('display', 'inline-block');
    }


    function hideDateSelect() {
        var dateSelect = document.getElementById('dateSelect');
        // dateSelect.style.setProperty('display', 'none')

        var inputGroup = document.getElementById('dateInputGroup');
        inputGroup.style.setProperty('display', 'none')
    }
    
    
    function clearDateSelect() {
        var downloadFormatsSelect = document.getElementById('downloadFormats');
        downloadFormatsSelect.selectedIndex = 0;

        hideDateSelect();
        var dateSelect = document.getElementById('dateSelect');
    
        var i;
        for (i = dateSelect.options.length - 1; i >= 0; i--) {
            dateSelect.remove(i);
        }
    }


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
                    [[-180, -90],
                    [-180, 90],
                    [180, 90],
                    [180, -90]],
                    // counterclockwise for holes
                    [[minx, miny],
                    [maxx, miny],
                    [maxx, maxy],
                    [minx, maxy]]
                ]
              },
            symbol: fillSymbol
        });

        // remove any existing graphics
        view.graphics.removeAll();

        view.graphics.add(graphic);

        // re-center on grid
        view.goTo({ target: graphic.geometry.center, zoom: 12 });

        // updateFilter(pointsLayer, graphic.geometry);
    }


    function reset() {
        geolocation = null;
        document.getElementById('datasetSelect').selectedIndex = 0;

        view.goTo({ target: CONUS_CENTROID, zoom: 3 });
        view.graphics.removeAll();
        clearPoints();
        clearDateSelect();
        displayMessage(welcomeMessage);
        selectedDay = null;

        grid.refresh();
        hideGrid();
    }


    function dateChangeHandler() {
        console.log('inside dataChangeHandler: ');

        state.update();
        console.log(state);

        // var day = evt.target.options[evt.target.selectedIndex].value;
        var dateSelect = document.getElementById('dateSelect');
        // shouldn't be possible to see this select w/o year summary data
        if (dateSelect.options.length == 0) {
            alert('You must first retrieve data for the year');
            return;
        }
        var day = dateSelect.options[dateSelect.selectedIndex].value;
        selectedDay = day;

        getDailyData(day);
    }


    function clearGrid() {
        if(grid){
            dataStore.objectStore.data = {};
            grid.set("collection", dataStore);
        }
    }


    function getDailyData(day) {
        console.log('inside getDailyData with ', day);
        // reformat day value into yyyymmdd
        var date = day.split('-').join('');

        var datasetSelect = document.getElementById('datasetSelect');
        var dataset = datasetSelect.options[datasetSelect.selectedIndex].value;

        displayMessage("retrieving data for " + dataset + " on " + day + ". Please standby...");
        showSpinner();
        // e.g. https://www.ncdc.noaa.gov/swdiws/csv/nx3structure/20190601?tile=-105.117,39.678
        var url = 'https://www.ncdc.noaa.gov/swdiws/json/' + dataset + '/' + date;
        console.log(url+'?tile='+geolocation);
        // console.log("retrieving data for " + dataset + " on " + day, url);

        esriRequest(url, {
            query: {
                tile: geolocation
            },
            responseType: "json"
        }).then(function (response) {
            console.log(response.data.result);
            
            var dailyData = response.data.result.map(function(event, i) {
                event['OBJECTID'] = i;
                return(event);
            });
    
            grid.refresh();
            grid.renderArray(dailyData);
            showGrid();
            
            displayMessage(response.data.result.length + ' events retrieved.');

            var results = parseDailyResults(response.data.result, dataset)

            console.log('results: ', results);
            drawPoints(results);

            hideSpinner();
        },
        function(error){
            console.log('error in getting daily data', error);
            if (error.details.httpStatus == 400) {
                displayMessage("Access to these data is restricted");
            } else {
                displayMessage("Error retrieving data from server. Please try again later");
            }
            hideSpinner();
        });
    }


    // TODO add parsing for other datasets
    function parseDailyResults(results, dataset) {
        switch (dataset) {
            case 'nx3structure':
            case 'nx3structure_all':
                return(parseNx3structure(results));

            case 'nx3hail':
            case 'nx3hail_all':
                    return(parseNx3hail(results));

            case 'nx3meso':
                // have yet to find a response example
                break;

            case 'nx3mda':
                return(parseNx3mda(results));

            case 'nx3tvs':
                return(parseNx3tvs(results));

            case 'plsr':
                // have yet to find a response example
                break;

            case 'nldn':
                return(parseNldn(results));

            default:
            console.error('unrecognized dataset: ', dataset);
            return;
        }
    }


    function extractCoordsFromWKT(wkt) {
        // bit of a hack to pull lon, lat from WKT string. depends on format like: "POINT (-105.083963633382 39.8283363414173)"
        var coords = wkt.substring(7, wkt.length - 1).split(' ');
        // TODO standardize the precision of the coords
        return(coords);
    }


    function parseNx3structure(results) {
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
        // console.log('inside draw points with '+results.events.length+' results.', results);

        // clear any existing graphics
        clearPoints();
        
        // generate list of Points and Graphics
        var graphics = [];
        results.events.forEach(function (event) {
            // augment the graphics attributes with the event type
            event['dataset'] = results.dataset;

            graphics.push(new Graphic({
                geometry: {
                    type: "point", // autocasts as new Point()
                    longitude: event.SHAPE[0],
                    latitude: event.SHAPE[1]
                },
                symbol: markerSymbol,
                attributes: event
            })
            );
        });
        pointsLayer.addMany(graphics);
    }


    // TODO add templates for nx3meso, plsr
    function getGraphicTooltip(marker) {
        var att = marker.attributes;
        switch (att.dataset) {
            case 'nx3structure':
            case 'nx3structure_all':
                return(`Time(UTC): ${att.ZTIME}<br>Radar ID: ${att.WSR_ID}<br>DBZ: ${att.MAX_REFLECT}<br>VIL:${att.VIL} kg/m&sup2;<br>Azimuth: ${att.AZIMUTH}&deg;<br>Range: ${att.RANGE} nm<br>lat/lon: ${marker.geometry.latitude.toFixed(3)}, ${marker.geometry.longitude.toFixed(3)}`)

            case 'nx3hail':
            case 'nx3hail_all':                
                return(`Time(UTC): ${att.ZTIME}<br>Radar ID: ${att.WSR_ID}<br>Probability: ${att.PROB}&percnt;<br>Severe Probability: ${att.SEVPROB}&percnt;<br>Max Size: ${att.MAXSIZE} inches<br>lat/lon: ${marker.geometry.latitude.toFixed(3)}, ${marker.geometry.longitude.toFixed(3)}`)
                        
            case 'nx3meso':
                // TODO 
                break;

            case 'nx3mda':
                return(`Time(UTC): ${att.ZTIME}<br>Radar ID: ${att.WSR_ID}<br>Strength Ranking: ${att.STR_RANK}<br>SCIT IT:${att.SCIT_ID}<br>Azimuth: ${att.AZIMUTH}&deg;<br>Range: ${att.RANGE} nm<br>lat/lon: ${marker.geometry.latitude.toFixed(3)}, ${marker.geometry.longitude.toFixed(3)}`)

            case 'nx3tvs':
                return(`Time(UTC): ${att.ZTIME}<br>Radar ID: ${att.WSR_ID}<br>Cell Type: ${att.CELL_TYPE}<br>Max Shear:${att.MAX_SHEAR} E-3/s<br>MXDV: ${att.MXDV} kts<br>Azimuth: ${att.AZIMUTH}&deg;<br>Range: ${att.RANGE} nm<br>lat/lon: ${marker.geometry.latitude.toFixed(3)}, ${marker.geometry.longitude.toFixed(3)}`)

            case 'plsr':
                // TODO
                break;

            case 'nldn':
                return(`Time(UTC): ${att.ZTIME}<br>Milliseconds: ${att.MILLISECONDS}<br>Detector Quantity: ${att.DETECTOR_QUANTITY}<br>Polarity:${att.POLARITY}<br>Stroke Strength: ${att.STROKE_STRENGTH}<br>Stroke Type: ${att.STROKE_TYPE}<br>Stroke Count: ${att.STROKE_COUNT}<br>lat/lon: ${marker.geometry.latitude.toFixed(3)}, ${marker.geometry.longitude.toFixed(3)}`)

            default:
            console.error('unrecognized dataset: ', dataset);
            return;
        }
    }


    function clearPoints() {
        pointsLayer.removeAll();
    }


    // not currently used 
    function updateFilter(featureLayerView, filterGeometry) {
        console.log('inside updateFilter with ', featureLayerView, filterGeometry);

        featureFilter = {
          // autocasts to FeatureFilter
          geometry: filterGeometry,
          spatialRelationship: 'intersects',
          distance: 1,
          units: 'miles'
        };
        // set effect on excluded features
        // make them gray and transparent
        if (view) {
          view.effect = {
            filter: featureFilter,
            excludedEffect: "grayscale(100%) opacity(30%)"
          };
        }
      }

});



//
// the follow don't have any JSAPI dependencies and are outside the module loading callback
//
var welcomeMessage = "Begin by searching for a location of interest by clicking on the map or entering an address or place...";

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

function showSpinner() {
    loadingDiv = document.getElementById('loadingDiv');
    loadingDiv.style.display = 'inline-block';
}

function hideSpinner() {
    loadingDiv = document.getElementById('loadingDiv');
    loadingDiv.style.display = 'none';
}

function  showGrid() {
    document.getElementById('grid').style.setProperty('display', 'block');
}

function hideGrid() {
    document.getElementById('grid').style.setProperty('display', 'none');
}




