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
    "esri/core/watchUtils",
    "app/globals",
    "app/DatasetParsers",
    'dojo/_base/lang',
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
    watchUtils,
    swdiGlobals,
    DatasetParsers,
    lang
    ) {

    var datasetParsers = new DatasetParsers();
    
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
    
    var state = {
        geolocation: null,
        busy: false,
        // refers to the state of the dateSelect and not the calendar
        selectedDay: null,
        
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
        }
    }

    // initialization
    populateYearSelect();
    populateDatasetSelect();
    displayMessage(swdiGlobals.getWelcomeMessage());
    updatePeriodOfRecord(state.getSelectValue('datasetSelect'));
    
    // setup button handlers
    domElements.resetButton.addEventListener("click", resetButtonHandler);
    domElements.downloadFormats.addEventListener("change", downloadFormatChangeHandler);
    domElements.dateSelect.addEventListener("change", dateChangeHandler);
    domElements.datasetSelect.addEventListener("change", datasetChangeHandler);
    domElements.yearSelect.addEventListener("change", yearChangeHandler);

    document.getElementById('introBtn').addEventListener('click', toggleIntroPanel);
    document.getElementById('introPanel').addEventListener('click', toggleIntroPanel);
    document.getElementById('downloadBtn').addEventListener('click', toggleDownloadPanel);
    document.getElementById('downloadPanel').addEventListener('click', toggleDownloadPanel);
    document.getElementById('wsBtn').addEventListener('click', function() {
        window.open('https://www.ncdc.noaa.gov/swdiws');
    });
    document.getElementById('disclaimerBtn').addEventListener('click', toggleDisclaimerPanel);
    document.getElementById('disclaimerPanel').addEventListener('click', toggleDisclaimerPanel);
    document.getElementById('disclaimerBtn').addEventListener('click', toggleDisclaimerPanel);
    document.getElementById('datasetHelpPanel').addEventListener('click', toggleDatasetHelpPanel);
    document.getElementById('datasetHelpBtn').addEventListener('click', toggleDatasetHelpPanel);
    document.getElementById('datasetHelpCloseBtn').addEventListener('click', hideDatasetHelp);


    function datasetChangeHandler() {
        // console.log('inside datasetChangeHandler...');
        updatePeriodOfRecord(state.getSelectValue('datasetSelect'));
    
        updateTileSummary();
    }


    function yearChangeHandler() {
        // console.log('inside yearChangeHandler...');
        state.selectedDay = null;

        updateTileSummary();
    }


    function resetButtonHandler() {
        // console.log('inside resetButtonHandler...');
        // TODO combine w/ reset()?
        reset();
    }


    function dateChangeHandler() {
        // console.log('inside dateChangeHandler: ');

        // format of YYYY-MM-DD
        var day = state.getSelectValue('dateSelect');

        // hang on to current date selection so if dataset is changed, we can try to immediately select that date        
        state.selectedDay = day;
        // console.log('selectedDay: ', day);

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

    watchUtils.whenTrue(view, "stationary", function() {
        // console.log('map is idle');
        state.busy = false;
    });
    watchUtils.whenFalse(view, "stationary", function() {
        // console.log('map is busy');
        state.busy = true;
    });

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
        // TODO add check for state.busy?
        if (resultGraphic) {
            setGeolocation(resultGraphic.geometry.longitude, resultGraphic.geometry.latitude);
        }
    });


    //  
    // supporting functions
    //
    function createGrid(datasetName) {
        // console.log('inside createGrid with ', datasetName);
        // clearGrid();


        var columns = swdiGlobals.getColumns(datasetName);
        if (! columns) {
            console.error('unrecognized dataset: ', datasetName);
            return;
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
        document.getElementById('datasetHelpPanel').style.display = 'none';
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
        document.getElementById('datasetHelpPanel').style.display = 'none';
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
        document.getElementById('datasetHelpPanel').style.display = 'none';
        // document.getElementById('creditsPanel').style.display = 'none';
    }


    function toggleDatasetHelpPanel() {
        var panel = document.getElementById('datasetHelpPanel');
        if (panel.style.display == 'none') {
            panel.style.display = 'inline-block';
        } else {
            panel.style.display = 'none';
        }
        document.getElementById('downloadPanel').style.display = 'none';
        document.getElementById('introPanel').style.display = 'none';
        document.getElementById('disclaimerPanel').style.display = 'none';
        // document.getElementById('creditsPanel').style.display = 'none';
    }

    function mapClickHandler(event) {
        // console.log('inside mapClickHandler');
        if (state.busy) {
            alert('cannot select a new tile until current query completes');
            console.log('cannot select a new tile until current query completes');
            return;
        }
        // Get the coordinates of the click on the map view
        setGeolocation(event.mapPoint.longitude, event.mapPoint.latitude);

        // match the zoom level used by Search widget
        view.goTo({ target: event.mapPoint, zoom: 12 }, { duration: 2000 })
    }


    // converts date like "20200101" to "2020-01-01"
    function formatDate(input) {
        if (input.length != 8) {
            console.error('invalid date format: '+ input);
            return('');
        }

        var year = input.substring(0,4);
        var month = input.substring(4,6);
        var day = input.substring(6,8);
        return ( [year, month, day].join('-') );
    }


    function updatePeriodOfRecord(dataset) {
        // console.log('inside updatePeriodOfRecord... ');
        var porDiv = document.getElementById('periodOfRecordDiv');

        porDiv.innerHTML = 'Period of Record: ';

        porPromise = getPeriodOfRecord(dataset);
        porPromise.then(
            function(response) {
                dates = response.data.result[0]
                porDiv.innerHTML = 'Period of Record: ' + formatDate(dates.BEGDATE) + ' to ' + formatDate(dates.ENDDATE);
            },
            function(error) {
                porDiv.innerHTML = 'Period of Record: not currently available'
                console.error('unable to retrieve Period of Record for '+dataset)
            }
        )
    }


    function getPeriodOfRecord(dataset) {
        var url = 'https://www.ncdc.noaa.gov/swdiws/json/' + dataset + '/periodOfRecord';
        console.log(url);
        return(esriRequest(url, {
            responseType: "json"
        }));
    }


    // when year or dataset changed, need to get a new annual summary and update UI elements
    function updateTileSummary() {
        // console.log('inside updateTileSummary()...')

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
        
        displayMessage("retrieving summary data for " + swdiGlobals.getDatasetLabel(dataset) + ' in '+ startYear + ". Please standby...");
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
                displayMessage("no data found for " + swdiGlobals.getDatasetLabel(dataset) + ' in '+ startYear);
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
            console.error('error in getting summary data', error);
            displayMessage("Error retrieving data from server. Please try again later");
            hideSpinner();
        });
    }


    function getSummaryData(point, dataset, startYear) {
        // console.log('inside getSummaryData()...');

        // always get 1 year's worth of data
        var endYear = startYear + 1;

        // e.g. https://www.ncdc.noaa.gov/swdiws/csv/nx3structure/20190101:20200101?stat=tilesum:-105,40
        var url = 'https://www.ncdc.noaa.gov/swdiws/json/' + dataset + '/' + startYear + '0101:' + endYear + '0101';
        console.log(url);
        
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
        // console.log('inside addDateSelectOptions with ', selectedDay);
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
            symbol: swdiGlobals.getFillSymbol()
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
        domElements.yearSelect.selectedIndex = 0;

        searchWidget.clear();
        view.goTo({ target: CONUS_CENTROID, zoom: 3 });
        view.graphics.removeAll();
        clearPoints();
        clearDateSelect();
        displayMessage(swdiGlobals.getWelcomeMessage());
        state.selectedDay = null;

        if (grid) { 
            grid.refresh(); 
            hideGrid();
        }

        //hideSpinner();
    }


    function showSpinner() {
        loadingDiv = document.getElementById('loadingDiv');
        loadingDiv.style.display = 'inline-block';
        state.busy = true;
        lockControls(true);
    }

    
    function hideSpinner() {
        loadingDiv = document.getElementById('loadingDiv');
        loadingDiv.style.display = 'none';
        state.busy = false;
        lockControls(false);
    }
    
    
    function lockControls(disabled) {
        // console.log('inside lockControls with ', disabled);
        ['yearSelect', 'datasetSelect', 'dateSelect', 'downloadFormats', 'resetButton'].forEach(function(elemName){
            document.getElementById(elemName).disabled = disabled;
        });
    }
    

    function clearGrid() {
        if (grid) {
            grid._setColumns([]);
            grid.refresh();
        }
        
        // if(grid){
        //     dataStore.objectStore.data = {};
        //     grid.set("collection", dataStore);
        // }
    }


    // expects date in format of 'YYYY-MM-DD'
    function getDailyData(day) {
        // console.log('inside getDailyData with ', day);
        // reformat day value into yyyymmdd
        var date = day.split('-').join('');

        var dataset = state.getSelectValue('datasetSelect');

        displayMessage("retrieving data for " + swdiGlobals.getDatasetLabel(dataset) + " on " + day + ". Please standby...");
 
        // reset UI while waiting on new annual summary data
        clearPoints();
        if (grid) {
            grid.refresh();
        }
        // clearGrid();

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
            console.error('error in getting daily data', error);
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
                return(datasetParsers.parseNx3structure(results));

            case 'nx3hail':
            case 'nx3hail_all':
                    return(datasetParsers.parseNx3hail(results));

            case 'nx3meso':
                // have yet to find a response example
                break;

            case 'nx3mda':
                return(datasetParsers.parseNx3mda(results));

            case 'nx3tvs':
                return(datasetParsers.parseNx3tvs(results));

            // case 'plsr':
            //     // have yet to find a response example
            //     break;

            case 'nldn':
                return(datasetParsers.parseNldn(results));

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
                symbol: swdiGlobals.getMarkerSymbol(),
                attributes: event
            })
            );
        });
        // graphics.forEach(function(graphic){
        //     console.log(graphic.geometry.longitude, graphic.geometry.latitude, graphic.attributes.ZTIME);
        // });

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

            // case 'plsr':
            //     // TODO
            //     break;

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
    
    function populateDatasetSelect() {
        var datasetSelect = document.getElementById("datasetSelect");
        var datasets = swdiGlobals.getDatasets();
    
        datasets.forEach(function(name){
            var option = document.createElement("option");
            option.text = swdiGlobals.getDatasetLabel(name);
            option.value = name;
            datasetSelect.add(option);
        });
        // default to the first entry
        datasetSelect.options[0].selected = true;
    }
    
    function  showGrid() {
        document.getElementById('grid').style.setProperty('display', 'block');
    }
    

    function hideGrid() {
        document.getElementById('grid').style.setProperty('display', 'none');
    }
        
});



//
// the following have to be on the Window object temporarily because they are called directly from the HTML elements
//
function hideDatasetHelp(event) {
    document.getElementById('datasetHelpPanel').style.setProperty('display', 'none');
    // keep it from triggering the handler for the parent DIV
    event.stopPropagation();
}






