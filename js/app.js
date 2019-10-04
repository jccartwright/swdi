require([
    "dojo/on", 
    "dojo/dom",
    "esri/Graphic",
    "esri/layers/GraphicsLayer",
    "esri/Map",
    "esri/views/MapView",
    "esri/request",
    "esri/widgets/Search",
    "esri/geometry/support/webMercatorUtils"
], function(on, dom, Graphic, GraphicsLayer, Map, MapView, esriRequest, Search, webMercatorUtils) {
    const CONUS_CENTROID = [-98.5795, 39.8283];

    // WARNING: global variable
    var geolocation = null;


    // setup button handlers
    var getDataButton = dom.byId('getDataButton');
    on(getDataButton, "click", getSummaryData);
    var resetButton = dom.byId('resetButton');
    on(resetButton, "click", reset);
    var dateSelect = dom.byId('dateSelect');
    on(dateSelect, "change", dateChangeHandler);
    // one style better than another?
    //dateSelect.addEventListener("change", dateChangeHandler);


    // TODO fill symbol not working
    // Create a symbol for rendering the tile boundary graphic
    var fillSymbol = {
      type: "simple-fill", // autocasts as new SimpleFillSymbol()
      color: [255,255,0, 0.2],
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
  var pointsLayer = new GraphicsLayer();
  map.add(pointsLayer);

  var view = new MapView({
      container: "viewDiv",
      map: map,
      zoom: 3,
      center: CONUS_CENTROID
  });

// view click conflicts w/ the popup on Graphic  
//   view.on("click", function(event) {
//     // don't need popup since just collecting the coordinate
//     view.popup.autoOpenEnabled = false;

//     // Get the coordinates of the click on the map view
//     setGeolocation(event.mapPoint.longitude, event.mapPoint.latitude);

//     // match the zoom level used by Search widget
//     view.goTo({ target: event.mapPoint, zoom: 12}, { duration: 2000 } )
//   }); 

  // geocode widget
  var searchWidget = new Search({
      view: view,
      popupEnabled: false
  });

  view.ui.add(searchWidget, {
    position: "top-right",
    index: 0
  });

  searchWidget.watch("resultGraphic", function(resultGraphic){
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
    if (! geolocation) {
      alert("please select a geolocation");
      return;
    }
  
    // e.g. https://www.ncdc.noaa.gov/swdiws/csv/nx3structure/20190101:20200101?stat=tilesum:-105,40
    var datasetSelect = document.getElementById('datasetSelect');
    var dataset = datasetSelect.options[datasetSelect.selectedIndex].value;
    var yearSelect = document.getElementById('yearSelect');
    var startYear = parseInt(yearSelect.options[yearSelect.selectedIndex].value);
    var endYear = startYear + 1;
    var url = 'https://www.ncdc.noaa.gov/swdiws/json/' + dataset + '/' + startYear + '0101:' + endYear + '0101';

    esriRequest(url, {
      query: {
        stat: "tilesum:" + geolocation
      },
      responseType: "json"
    }).then(function(response){
      var summaryData = response.data;
      // console.log(summaryData);
      
      // populate date select
      addDateSelectOptions(summaryData.result);
    });
  }


  function addDateSelectOptions(results) {
    var dateSelect = document.getElementById('dateSelect');

    // remove any previously existing options
    clearDateSelect();

    // add options corresponding to most recent search results
    results.forEach(function(result) {
      var option = document.createElement("option");
      option.value = result.DAY;
      option.text = result.DAY + ' ('+ result.FCOUNT + ' events)';
      dateSelect.add(option);
    });

    // fire the handler to display the first day
    dateChangeHandler();
  }


  function clearDateSelect() {
    // console.log('inside clearDateSelect...');
    var dateSelect = document.getElementById('dateSelect');
    
    var i;
    for(i = dateSelect.options.length - 1 ; i >= 0 ; i--) {
        dateSelect.remove(i);
    }
  }


  // TODO draw tile boundaries on map
  function setGeolocation(longitude, latitude) {
      var lat = Math.round(latitude * 1000) / 1000;
      var lon = Math.round(longitude * 1000) / 1000;
      addTileBoundary(lon, lat);
      geolocation = lon + "," + lat;
      document.getElementById('geolocationInput').value = geolocation;
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
      view.goTo({ target: graphic.geometry.center, zoom: 12});
  }


  function reset() {
    // console.log('inside reset...');
    geolocation = null;
    document.getElementById('geolocationInput').value = geolocation;

    view.goTo({ target: CONUS_CENTROID, zoom: 3});
    view.graphics.removeAll();
    pointsLayer.removeAll();
    clearDateSelect();
  }


  function dateChangeHandler(evt) {
    // console.log('inside dateChangeHandler...');
    // var day = evt.target.options[evt.target.selectedIndex].value;
    var dateSelect = document.getElementById('dateSelect');
    var day = dateSelect.options[dateSelect.selectedIndex].value;

    getDailyData(day);
  }


  function getDailyData(day) {
    // console.log('inside getDailyData with ',day);

    // reformat day value into yyyymmdd
    var date = day.split('-').join('');

    var datasetSelect = document.getElementById('datasetSelect');
    var dataset = datasetSelect.options[datasetSelect.selectedIndex].value;

    // e.g. https://www.ncdc.noaa.gov/swdiws/csv/nx3structure/20190601?tile=-105.117,39.678
    var url = 'https://www.ncdc.noaa.gov/swdiws/json/' + dataset + '/' + date;
    // console.log(url);

    esriRequest(url, {
      query: {
        tile: geolocation
      },
      responseType: "json"
    }).then(function(response){
      var dailyData = response.data;
      // console.log(dailyData.result);

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
    pointsLayer.removeAll();

    // generate list of Points and Graphics
    var graphics = [];
    results.forEach(function(result) {
      // bit of a hack to pull lon, lat from WKT string. depends on format like: "POINT (-105.083963633382 39.8283363414173)"
      var coords = result.SHAPE.substring(7, result.SHAPE.length -1).split(' ');
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
          popupTemplate: pointPopupTemplate
        })
      );
    });
    pointsLayer.addMany(graphics);
  }
});

//
// the follow don't have any JSAPI dependencies and are outside the module loading callback
//

function init() {
  // console.log('inside init...');
  populateYearSelect();
  
}


function populateYearSelect() {
  var currentYear = new Date().getFullYear();
  var yearSelect = document.getElementById("yearSelect");
  for (i=currentYear; i>=1992; i--) {
    var option = document.createElement("option");
    option.text = i;
    yearSelect.add(option);
  }
  yearSelect.options[0].selected = true;
}

function showDatasetHelp(){
  document.getElementById('datasetHelp').style.setProperty('display', 'block');
}

function hideDatasetHelp() {
  document.getElementById('datasetHelp').style.setProperty('display', 'none');
}



