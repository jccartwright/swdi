import { Component, OnInit } from '@angular/core';
import { GeocodeService } from '../geocode.service';


@Component({
  selector: 'app-location',
  templateUrl: './location.component.html',
  styleUrls: ['./location.component.css']
})
export class LocationComponent implements OnInit {

  constructor(private geocodeService: GeocodeService) { }
  coordinates: Location;

  ngOnInit() {
  }

  lookupLocation(location: string) {
    if (location) {
      console.log('searching for ' + location);
      this.geocodeService.geocode(location)
        .subscribe(
          (data: Location) => {
            this.coordinates = data;
          }
        );
    }
  }
}
