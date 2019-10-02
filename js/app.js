require([
    "dojo/on", 
    "dojo/dom",
    "esri/Graphic",
    "esri/Map",
    "esri/views/MapView",
    "esri/request",
    "esri/widgets/Search",
    "esri/geometry/support/webMercatorUtils"
], function(on, dom, Graphic, Map, MapView, esriRequest, Search, webMercatorUtils) {
    const CONUS_CENTROID = [-98.5795, 39.8283];

    // WARNING: global variable
    var geolocation = null;


    // setup button handlers
    var getDataButton = dom.byId('getDataButton');
    on(getDataButton, "click", getSummaryData);
    var resetButton = dom.byId('resetButton');
    on(resetButton, "click", reset);

    // TODO fill symbol not working
    // Create a symbol for rendering the tile boundary graphic
    var fillSymbol = {
      type: "simple-fill", // autocasts as new SimpleFillSymbol()
      color: [255,0,0, 0.5],
      outline: {
          // autocasts as new SimpleLineSymbol()
          color: [255, 0, 0],
          width: 1
      }
  };

  // setup map and view
  var map = new Map({
    basemap: "streets" 
  });

  var view = new MapView({
      container: "viewDiv",
      map: map,
      zoom: 3,
      center: CONUS_CENTROID
  });

  view.on("click", function(event) {
    // don't need popup since just collecting the coordinate
    view.popup.autoOpenEnabled = false;

    // Get the coordinates of the click on the map view
    setGeolocation(event.mapPoint.longitude, event.mapPoint.latitude);

    // match the zoom level used by Search widget
    view.goTo({ target: event.mapPoint, zoom: 12}, { duration: 2000 } )
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

  searchWidget.watch("resultGraphic", function(resultGraphic){
      // resultGraphic can be null when resetting the Search widget
      if (resultGraphic) {
        setGeolocation(resultGraphic.geometry.longitude, resultGraphic.geometry.latitude);
      }
      console.log(view.zoom);
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
      // TODO populate date select
      console.log(summaryData);
    });
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

      var graphic = new Graphic({
          geometry: {
              type: "polygon",
              rings: [
                  [minx, miny],
                  [maxx, miny],
                  [maxx, maxy],
                  [minx, maxy]
              ]
          },
          symbol: fillSymbol
      });

      // remove any existing graphics
      view.graphics.removeAll();

      view.graphics.add(graphic);
  }

  function reset() {
    // console.log('inside reset...');
    geolocation = null;
    document.getElementById('geolocationInput').value = geolocation;

    view.goTo({ target: CONUS_CENTROID, zoom: 3});
    view.graphics.removeAll();
  }
});

//
// the follow don't have any JSAPI dependencies and are outside the module loading callback
//

function init() {
  console.log('inside init...');
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



