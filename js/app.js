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
    "app/formatters",
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
    myglobals,
    formatters
    ) {
    populateYearSelect();

    // console.log('myglobals', myglobals);
    // console.log(myglobals.getName());
    
    const CONUS_CENTROID = [-98.5795, 39.8283];
    // const gridDiv = document.getElementById("grid");
    var CustomGrid = declare([Grid, Selection, ColumnHider]);
    var grid = null;

    // convenience to reduce noise in referencing DOM elements
    var domElements = {
        'downloadPanel': document.getElementById('downloadPanel'),
        'introPanel': document.getElementById('introPanel'),
        'dateSelect': document.getElementById('dateSelect'),
        'disclaimerPanel': document.getElementById('disclaimerPanel'),
        'datasetSelect': document.getElementById('datasetSelect'),
        'downloadFormats': document.getElementById('downloadFormats'),
        'yearSelect': document.getElementById('yearSelect'),
        'resetButton': document.getElementById('resetButton')
    }
    // TODO test that every element in domElements is defined?
    
    var state = {
        geolocation: null,
        // the following two variables refer to the state of the dateSelect and not the calendar
        selectedDay: null,
        currentDay: null,
        year: null,
        dataset: null,
        
        formatDate: function() {
            // reformat day value into yyyymmdd
            return (this.day.split('-').join(''));
        },

        getSelectValue: function(elementName) {
            var elem = domElements[elementName]
            if (elem && elem.options.length ) {
                var optionIndex = elem.selectedIndex > 0 ? elem.selectedIndex: 0
                return elem.options[optionIndex].value
            } else {
                console.error('invalid elementName provided: '+elementName+' or element has no Options')
                return undefined
            }
        },

        update: function() {
            this.dataset = this.getSelectValue('datasetSelect')
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


    // debugging
    state.update();
    console.log(state);

    // setup button handlers
    domElements.resetButton.addEventListener("click", resetButtonHandler);
    domElements.downloadFormats.addEventListener("change", downloadFormatChangeHandler);
    domElements.dateSelect.addEventListener("change", dateChangeHandler);
    domElements.datasetSelect.addEventListener("change", datasetChangeHandler);
    domElements.yearSelect.addEventListener("change", yearChangeHandler);

    on(dom.byId('introBtn'), 'click', toggleIntroPanel);
    on(dom.byId('introPanel'), 'click', toggleIntroPanel);
    on(dom.byId('downloadBtn'), 'click', toggleDownloadPanel);
    on(dom.byId('downloadPanel'), 'click', toggleDownloadPanel);
    on(dom.byId('wsBtn'), 'click', function() {
        window.open('https://www.ncdc.noaa.gov/swdiws');
    });
    on(dom.byId('disclaimerBtn'), 'click', toggleDisclaimerPanel);
    on(dom.byId('disclaimerPanel'), 'click', toggleDisclaimerPanel);


    function datasetChangeHandler() {
        console.log('inside datasetChangeHandler...');
        updateTileSummary();
    }


    function yearChangeHandler() {
        console.log('inside yearChangeHandler...');
        state.selectedDay = null;

        updateTileSummary();
    }


    function resetButtonHandler() {
        console.log('inside resetButtonHandler...');
        // TODO combine w/ reset()?
        reset();
    }


    function dateChangeHandler() {
        console.log('inside dateChangeHandler: ');

        // format of YYYY-MM-DD
        var day = state.getSelectValue('dateSelect');

        // hang on to current date selection so if dataset is changed, we can try to immediately select that date        
        state.selectedDay = day;
        console.log('selectedDay: ', day);

        // shouldn't be possible to see this select w/o year summary data
        if (domElements.dateSelect.options.length == 0) {
            alert('You must first retrieve data for the year');
            return;
        }

        getDailyData(day);
    }

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

        // console.log('creating new grid with columns', columns);

        // hack to avoid "TypeError: Cannot read property 'element' of undefined"
        if (grid) {
            grid._setColumns([]);
            grid.refresh();
        }

        grid = new CustomGrid({
            columns: columns
        }, 'grid');

        // add a row-click listener on the grid. This will be used
        // to highlight the corresponding feature on the view
        // grid.on("dgrid-select", selectFeatureFromGrid);
      }


    function downloadFormatChangeHandler(evt) {
        // console.log('inside downloadFormatChangeHandler with ', evt);
        var format = evt.target.options[evt.target.selectedIndex].value;
        if (! format) {
            alert("you must choose a valid format in which to download the day's data");
            return;
        }

        var dataset = state.getSelectValue('datasetSelect');
        var day = state.getSelectValue('dateSelect');

        // reformat day value into yyyymmdd
        var date = day.split('-').join('');

        switch(format) {
            case 'csv':
                var url = 'https://www.ncdc.noaa.gov/swdiws/csv/' + dataset + '/' + date + '?tile=' + state.geolocation; 
                break;

            case 'json':
                url = 'https://www.ncdc.noaa.gov/swdiws/json/' + dataset + '/' + date + '?tile=' + state.geolocation; 
                break;

            case 'xml':
                url = 'https://www.ncdc.noaa.gov/swdiws/xml/' + dataset + '/' + date + '?tile=' + state.geolocation; 
                break;

            case 'kmz':
                url = 'https://www.ncdc.noaa.gov/swdiws/kmz/' + dataset + '/' + date + '?tile=' + state.geolocation; 
                break;

            case 'shp':
                url = 'https://www.ncdc.noaa.gov/swdiws/shp/' + dataset + '/' + date + '?tile=' + state.geolocation; 
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


    function mapClickHandler(event) {
        // Get the coordinates of the click on the map view
        setGeolocation(event.mapPoint.longitude, event.mapPoint.latitude);

        // match the zoom level used by Search widget
        view.goTo({ target: event.mapPoint, zoom: 12 }, { duration: 2000 })
    }


    // when year or dataset changed, need to get a new annual summary and update UI elements
    function updateTileSummary() {
        console.log('inside updateTileSummary()...')

        // must have a tile in order to get annual data.  Can happen if user changes year or dataset before selecting a tile.
        if (!state.geolocation) {
            alert("please select a geolocation");
            return;
        }

        // reset UI while waiting on new annual summary data
        clearDateSelect();
        clearPoints();

        // format of "lon,lat"
        var point = state.geolocation;
        var dataset = state.getSelectValue('datasetSelect');
        var startYear = parseInt(state.getSelectValue('yearSelect'));
        
        displayMessage("retrieving summary data for " + dataset + ' in '+ startYear + ". Please standby...");
        showSpinner();
        var summaryDataPromise = getSummaryData(point, dataset, startYear);

        summaryDataPromise.then(function(response) {
            var summaryData = response.data;
            var stats = countSummaryData(summaryData.result);
            var selectedDayInResults = summaryData.result.map(x => x.DAY).includes(state.selectedDay);
            
            hideSpinner();

            createGrid(dataset);
            
            if (stats.totalEvents > 0) {
                displayMessage("data retrieved - found " + stats.totalEvents + " events across " + stats.numberOfDays + " days.");
            } else {
                displayMessage("no data found for " + dataset + ' in '+ startYear);
                hideGrid();
                return;
            }

            // populate date select, defaulting to the previously selected day (if any)
            addDateSelectOptions(summaryData.result, state.selectedDay);

            // display data if this year/dataset contains a match for the previous day (if any)
            var day = state.getSelectValue('dateSelect');
            if (! state.selectedDay || selectedDayInResults) {
                getDailyData(day);
            } else {
                // no data for this tile, dataset, and date
                hideDateSelect();
                displayMessage("no data found for " + dataset + ' on '+ state.selectedDay);
                hideGrid();
            }
        }, 
        function(error) {
            // promise failed, possibly due to web service unavailable
            console.log('error in getting summary data', error);
            displayMessage("Error retrieving data from server. Please try again later");
            hideSpinner();
        });
    }


    function getSummaryData(point, dataset, startYear) {
        console.log('inside getSummaryData()...');

        // always get 1 year's worth of data
        var endYear = startYear + 1;

        // e.g. https://www.ncdc.noaa.gov/swdiws/csv/nx3structure/20190101:20200101?stat=tilesum:-105,40
        var url = 'https://www.ncdc.noaa.gov/swdiws/json/' + dataset + '/' + startYear + '0101:' + endYear + '0101';
        
        return(esriRequest(url, {
            query: {
                stat: "tilesum:" + point
            },
            responseType: "json"
        }));
    }


    function countSummaryData(results) {
        totalEvents = 0;
        results.forEach(function (result) {
            totalEvents = totalEvents + parseInt(result.FCOUNT);
        });
        return ({ 'numberOfDays': results.length, 'totalEvents': totalEvents });
    }


    // if there is a previously-selected date among the new Options, mark it as 'selected'
    function addDateSelectOptions(results, selectedDay) {
        console.log('inside addDateSelectOptions with ', selectedDay);
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
    
        // 
        var i;
        for (i = dateSelect.options.length - 1; i >= 0; i--) {
            dateSelect.remove(i);
        }
    }


    function setGeolocation(longitude, latitude) {
        var lat = Math.round(latitude * 1000) / 1000;
        var lon = Math.round(longitude * 1000) / 1000;
        addTileBoundary(lon, lat);
        state.geolocation = lon + "," + lat;

        displayMessage("coordinates " + state.geolocation + " selected.");
        updateTileSummary();
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
            symbol: myglobals.getFillSymbol()
        });

        // remove any existing graphics
        view.graphics.removeAll();

        view.graphics.add(graphic);

        // re-center on grid
        view.goTo({ target: graphic.geometry.center, zoom: 12 });
    }


    function reset() {
        state.geolocation = null;
        domElements.datasetSelect.selectedIndex = 0;

        view.goTo({ target: CONUS_CENTROID, zoom: 3 });
        view.graphics.removeAll();
        clearPoints();
        clearDateSelect();
        displayMessage(welcomeMessage);
        state.selectedDay = null;

        grid.refresh();
        hideGrid();
    }




    function clearGrid() {
        if(grid){
            dataStore.objectStore.data = {};
            grid.set("collection", dataStore);
        }
    }


    // expects date in format of 'YYYY-MM-DD'
    function getDailyData(day) {
        console.log('inside getDailyData with ', day);
        // reformat day value into yyyymmdd
        var date = day.split('-').join('');

        var dataset = state.getSelectValue('datasetSelect');

        displayMessage("retrieving data for " + dataset + " on " + day + ". Please standby...");

        showSpinner();

        // e.g. https://www.ncdc.noaa.gov/swdiws/csv/nx3structure/20190601?tile=-105.117,39.678
        var url = 'https://www.ncdc.noaa.gov/swdiws/json/' + dataset + '/' + date;

        console.log(url+'?tile='+state.geolocation);
        // console.log("retrieving data for " + dataset + " on " + day, url);

        // remove point from the previous selection
        clearPoints();

        esriRequest(url, {
            query: {
                tile: state.geolocation
            },
            responseType: "json"
        }).then(function (response) {
            // console.log(response.data.result);
            
            var dailyData = response.data.result.map(function(event, i) {
                event['OBJECTID'] = i;
                return(event);
            });

            grid.refresh();
            grid.renderArray(dailyData);
            showGrid();
            
            displayMessage(response.data.result.length + ' events retrieved.');

            var results = parseDailyResults(response.data.result, dataset)

            // console.log('results: ', results);
            drawPoints(results);

            hideSpinner();
        },
        function(error){
            console.log('error in getting daily data', error);
            // lightning data only available to government IPs
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
                symbol: myglobals.getMarkerSymbol(),
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




