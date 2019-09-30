require([
    "esri/Map",
    "esri/views/MapView",
    "esri/widgets/Search"
], function(Map, MapView, Search) {
    var map = new Map({ basemap: "gray" });

    var view = new MapView({
        container: "viewDiv",
        map: map,
        zoom: 3
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
          console.log('ResultGraphic changed: ',resultGraphic);
      })

      view.on("click", function(event) {
        // don't need popup since just collecting the coordinate
        view.popup.autoOpenEnabled = false;
       
        // Get the coordinates of the click on the view
        var lat = Math.round(event.mapPoint.latitude * 1000) / 1000;
        var lon = Math.round(event.mapPoint.longitude * 1000) / 1000;
        lat1 = event.mapPoint.latitude.toFixed(3);
        lon1 = event.mapPoint.longitude.toFixed(3);
        console.log(lon, lat);
        console.log(lon1, lat1);
       });
});
