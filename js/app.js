require([
    "dojo/on", 
    "dojo/dom",
    "esri/Map",
    "esri/views/MapView",
    "esri/request",
    "esri/widgets/Search"
], function(on, dom, Map, MapView, esriRequest, Search) {
    var map = new Map({ basemap: "gray" });

    var view = new MapView({
        container: "viewDiv",
        map: map,
        zoom: 3,
        center: [-98.5795, 39.8283]  //center of CONUS
    });

    var searchWidget = new Search({
        view: view
    });

    // Adds the search widget below other elements in
    // the top left corner of the view
    view.ui.add(searchWidget, {
      position: "top-right",
      index: 2
    });

    searchWidget.watch("resultGraphic", function(resultGraphic){
        // console.log('ResultGraphic changed: ',resultGraphic);
        // resultGraphic can be null when resetting the Search widget
        if (resultGraphic) {
          setGeolocation(resultGraphic.geometry.longitude, resultGraphic.geometry.latitude);
        }
    })

    view.on("click", function(event) {
      // don't need popup since just collecting the coordinate
      view.popup.autoOpenEnabled = false;

      // Get the coordinates of the click on the map view
      setGeolocation(event.mapPoint.longitude, event.mapPoint.latitude);
    });

    function getSummaryData(evt) {
      console.log('inside getSummaryData()...', evt);
      if (! geolocation) {
        alert("please select a geolocation");
        return;
      }
    
      // https://www.ncdc.noaa.gov/swdiws/csv/nx3structure/20190101:20200101?stat=tilesum:-105,40
      var datasetSelect = document.getElementById('datasetSelect');
      var dataset = datasetSelect.options[datasetSelect.selectedIndex].value;
      var yearSelect = document.getElementById('yearSelect');
      var startYear = parseInt(yearSelect.options[yearSelect.selectedIndex].value);
      var endYear = startYear + 1;
      var url = 'https://www.ncdc.noaa.gov/swdiws/json/' + dataset + '/' + startYear + '0101:' + endYear + '0101';

      var options = {
        // These properties will be appended to the request URL in the following format:
        query: {
          stat: "tilesum:" + geolocation
        },
        responseType: "json"
      };


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

  var getDataButton = dom.byId('getDataButton');
  on(getDataButton, "click", getSummaryData);


});

// WARNING: global variable
var geolocation = null;

function init() {
  console.log('inside init...');
  populateYearSelect();
}

// TODO draw tile boundaries on map
function setGeolocation(longitude, latitude) {
  var lat = Math.round(latitude * 1000) / 1000;
  var lon = Math.round(longitude * 1000) / 1000;
  // TODO: why is this better/worse?
  // lat = event.mapPoint.latitude.toFixed(3);
  geolocation = lon + "," + lat;
  document.getElementById('geolocationInput').value = geolocation;
  console.log(lon, lat);
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



function reset() {
  console.log('inside reset...');
  geolocation = null;
  document.getElementById('geolocationInput').value = geolocation;
}